"""Trusted harness for an inspected Stanley connector."""
import builtins
import ipaddress
import json
import os
import socket
import sys
import time
from urllib.parse import urljoin, urlparse

try:
    import resource
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    resource.setrlimit(resource.RLIMIT_NPROC, (0, 0))
    memory_limit = 256 * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (memory_limit, memory_limit))
except (ImportError, OSError, ValueError):
    pass

payload = json.loads(sys.stdin.read())
policy = payload["policy"]
source = payload["source"]
inputs = payload.get("inputs", {})
secret_values = payload.get("vault", {})
allowed_domains = {value.lower() for value in policy.get("targetDomains", [])}
allowed_methods = {value.upper() for value in policy.get("allowedMethods", [])}
network_policy = policy.get("networkPolicy", {})
https_only = network_policy.get("httpsOnly", True)
max_redirects = min(int(network_policy.get("maxRedirects", 2)), 5)
connect_timeout = min(float(network_policy.get("connectTimeoutMs", 5000)) / 1000, 10)
read_timeout = min(float(network_policy.get("readTimeoutMs", 15000)) / 1000, 30)
max_response = min(int(policy.get("maxResponseBytes", 2_000_000)), 10_000_000)
max_requests = min(int(network_policy.get("maxRequests", 20)), 100)
deadline = time.monotonic() + min(int(policy.get("timeoutMs", 15000)) / 1000, 30)
mode = payload.get("mode", "live")

class SecurityError(RuntimeError):
    pass

def redact_text(value):
    text = str(value)
    for secret in sorted((str(item) for item in secret_values.values() if len(str(item)) >= 3), key=len, reverse=True):
        text = text.replace(secret, "[REDACTED]")
    return text

def safe_host(url):
    parsed = urlparse(url)
    if parsed.scheme not in ({"https"} if https_only else {"http", "https"}):
        raise SecurityError("URL scheme is not allowed")
    host = (parsed.hostname or "").lower()
    if host not in allowed_domains:
        raise SecurityError("network destination is not declared")
    if parsed.username or parsed.password:
        raise SecurityError("credentials in URLs are forbidden")
    if parsed.port not in (None, 80, 443):
        raise SecurityError("non-standard destination ports are forbidden")
    try:
        resolved = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise SecurityError("destination DNS resolution failed") from exc
    if not resolved:
        raise SecurityError("destination did not resolve")
    for address in {info[4][0] for info in resolved}:
        ip = ipaddress.ip_address(address)
        if not ip.is_global or ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise SecurityError("destination resolved to a forbidden address")
    return parsed, resolved

class HttpResponse:
    __slots__ = ("status_code", "headers", "text", "url")
    def __init__(self, status_code, headers, content, url):
        self.status_code = status_code
        self.headers = headers
        self.text = content.decode("utf-8", errors="replace")
        self.url = url
    def json(self):
        return json.loads(self.text)

class HttpClient:
    __slots__ = ("_session", "_request_count")
    def __init__(self):
        self._session = None
        self._request_count = 0
    def request(self, method, url, *, params=None, json_body=None, data=None, headers=None):
        method = str(method).upper()
        if method not in allowed_methods:
            raise SecurityError("HTTP method is not allowed")
        if mode == "shadow" and method not in {"GET", "HEAD"}:
            return HttpResponse(200, {"x-stanley-shadow": "true"}, b'{"simulated":true}', str(url))
        if self._session is None:
            import requests
            self._session = requests.Session()
            self._session.trust_env = False
            self._session.headers.update({"User-Agent": "Stanley-Connector/1.0"})
        current = str(url)
        clean_headers = {}
        for key, value in (headers or {}).items():
            lowered = str(key).lower()
            if lowered in {"host", "proxy-authorization", "connection", "transfer-encoding"}:
                raise SecurityError("restricted HTTP header")
            clean_headers[str(key)] = str(value)
        for redirect in range(max_redirects + 1):
            self._request_count += 1
            if self._request_count > max_requests:
                raise SecurityError("connector request count exceeded limit")
            if time.monotonic() >= deadline:
                raise TimeoutError("connector deadline exceeded")
            parsed, resolved = safe_host(current)
            original_getaddrinfo = socket.getaddrinfo
            def pinned_getaddrinfo(host, port, *args, **kwargs):
                if str(host).lower() != (parsed.hostname or "").lower():
                    raise SecurityError("unexpected DNS lookup blocked")
                return resolved
            socket.getaddrinfo = pinned_getaddrinfo
            try:
                response = self._session.request(
                    method, current, params=params if redirect == 0 else None,
                    json=json_body if redirect == 0 else None, data=data if redirect == 0 else None,
                    headers=clean_headers, allow_redirects=False, stream=True,
                    timeout=(connect_timeout, min(read_timeout, max(0.1, deadline - time.monotonic()))),
                    proxies={"http": None, "https": None},
                )
            finally:
                socket.getaddrinfo = original_getaddrinfo
            if response.status_code == 429 and redirect < max_redirects:
                try: retry_after = min(float(response.headers.get("retry-after", "0")), 2.0)
                except ValueError: retry_after = 0
                if retry_after > 0 and time.monotonic() + retry_after < deadline:
                    time.sleep(retry_after)
                    continue
            if response.is_redirect or response.is_permanent_redirect:
                if redirect >= max_redirects:
                    raise SecurityError("redirect limit exceeded")
                location = response.headers.get("location")
                if not location:
                    raise SecurityError("redirect missing destination")
                current = urljoin(current, location)
                safe_host(current)
                continue
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > max_response:
                    raise SecurityError("HTTP response exceeded limit")
                chunks.append(chunk)
            headers_out = {key: value for key, value in response.headers.items() if key.lower() not in {"set-cookie", "authorization", "proxy-authenticate"}}
            return HttpResponse(response.status_code, headers_out, b"".join(chunks), response.url)
        raise SecurityError("redirect handling failed")

class SecretVault:
    __slots__ = ("_values",)
    def __init__(self, values): self._values = dict(values)
    def get(self, name):
        if name not in self._values: raise SecurityError("vault reference is unavailable")
        return self._values[name]

allowed_imports = set(policy.get("allowedImports", []))
real_import = builtins.__import__
def limited_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level or name not in allowed_imports:
        raise SecurityError("import is not allowed")
    return real_import(name, globals, locals, fromlist, level)

safe_builtins = {
    "__import__": limited_import, "abs": abs, "all": all, "any": any, "bool": bool,
    "dict": dict, "enumerate": enumerate, "Exception": Exception, "float": float,
    "int": int, "isinstance": isinstance, "len": len, "list": list, "map": map,
    "max": max, "min": min, "range": range, "reversed": reversed, "round": round,
    "set": set, "sorted": sorted, "str": str, "sum": sum, "tuple": tuple, "zip": zip,
}
scope = {"__builtins__": safe_builtins, "inputs": inputs, "vault": SecretVault(secret_values), "http": HttpClient()}
try:
    exec(compile(source, "<stanley-connector>", "exec"), scope, scope)
    result = scope.get("result")
    encoded = json.dumps(result, separators=(",", ":"), ensure_ascii=False)
    for secret in secret_values.values():
        if len(str(secret)) >= 3 and str(secret) in encoded:
            raise SecurityError("connector output contains secret material")
    sys.stdout.write(encoded)
except BaseException as exc:
    sys.stderr.write(redact_text(f"{type(exc).__name__}: {exc}")[:1000])
    raise SystemExit(1)
