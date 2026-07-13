"""Static verifier for untrusted Stanley connector source."""
import ast
import json
import sys
from urllib.parse import urlparse

policy = json.loads(sys.argv[1])
source = sys.stdin.read()
allowed_imports = set(policy.get("allowedImports", []))
allowed_methods = set(method.upper() for method in policy.get("allowedMethods", []))
allowed_domains = set(domain.lower() for domain in policy.get("targetDomains", []))
allowed_vault_refs = set(policy.get("requiredVaultRefs", []))
errors = []
imports = []
network_calls = []
vault_refs = []

FORBIDDEN_NAMES = {
    "eval", "exec", "compile", "open", "input", "help", "breakpoint", "globals",
    "locals", "vars", "dir", "getattr", "setattr", "delattr", "memoryview",
}
FORBIDDEN_MODULES = {
    "os", "sys", "subprocess", "socket", "ctypes", "multiprocessing", "threading",
    "asyncio", "importlib", "pathlib", "shutil", "tempfile", "pickle", "marshal",
    "shelve", "builtins", "site", "pip", "venv", "webbrowser", "http", "urllib.request",
}
SAFE_MODULE_CALLS = {
    "json": {"loads", "dumps"},
    "re": {"search", "match", "fullmatch", "findall", "finditer", "sub", "split", "escape", "compile"},
    "datetime": {"date", "datetime", "time", "timedelta", "timezone"},
    "urllib.parse": {"urlencode", "quote", "quote_plus", "unquote", "urljoin", "urlparse", "parse_qs"},
    "bs4": {"BeautifulSoup"},
}

def add(message, node=None):
    line = getattr(node, "lineno", None)
    errors.append(f"line {line}: {message}" if line else message)

def literal_string(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None

def attr_path(node):
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return ""

try:
    tree = ast.parse(source, mode="exec")
except SyntaxError as exc:
    print(json.dumps({"ok": False, "errors": [f"line {exc.lineno}: syntax error"], "imports": [], "networkCalls": [], "vaultRefs": []}))
    raise SystemExit(0)

import_bindings = {}
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            name = alias.name
            binding = alias.asname or name.split(".")[0]
            imports.append(name)
            import_bindings[binding] = name
            if name not in allowed_imports or name in FORBIDDEN_MODULES or name.split(".")[0] in FORBIDDEN_MODULES:
                add(f"import not allowed: {name}", node)
    elif isinstance(node, ast.ImportFrom):
        add("from-imports are not allowed; import the declared module", node)
    elif isinstance(node, (ast.Global, ast.Nonlocal, ast.AsyncFunctionDef, ast.Await, ast.Yield, ast.YieldFrom)):
        add(f"unsupported capability: {type(node).__name__}", node)
    elif isinstance(node, ast.Attribute) and node.attr.startswith("_"):
        add("private and dunder attributes are forbidden", node)
    elif isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
        add(f"dangerous name: {node.id}", node)

for node in ast.walk(tree):
    if not isinstance(node, ast.Attribute):
        continue
    path = attr_path(node)
    root = path.split(".")[0] if path else ""
    imported = import_bindings.get(root)
    if imported:
        canonical = imported + path[len(root):]
        module = next((name for name in SAFE_MODULE_CALLS if canonical == name or canonical.startswith(name + ".")), None)
        operation = canonical[len(module) + 1:].split(".")[0] if module and len(canonical) > len(module) else ""
        if not module or (operation not in SAFE_MODULE_CALLS[module] and not operation.isupper()):
            add(f"module attribute is not allowlisted: {canonical}", node)

for node in ast.walk(tree):
    if not isinstance(node, ast.Call):
        continue
    path = attr_path(node.func)
    if isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_NAMES:
        add(f"dangerous call: {node.func.id}", node)
        continue
    if path == "http.request":
        method = literal_string(node.args[0]) if len(node.args) > 0 else None
        url = literal_string(node.args[1]) if len(node.args) > 1 else None
        if not method or method.upper() not in allowed_methods:
            add("HTTP method must be a declared literal", node)
        if not url:
            add("network destination must be a literal URL; put dynamic values in params or body", node)
        else:
            parsed = urlparse(url)
            host = (parsed.hostname or "").lower()
            if parsed.scheme not in ({"https"} if policy.get("networkPolicy", {}).get("httpsOnly", True) else {"http", "https"}):
                add("URL scheme is not allowed", node)
            if host not in allowed_domains:
                add("network destination is not declared", node)
        network_calls.append({"method": method.upper() if method else None, "url": url})
    elif path == "vault.get":
        ref = literal_string(node.args[0]) if node.args else None
        if not ref or ref not in allowed_vault_refs:
            add("vault.get requires a declared literal reference", node)
        else:
            vault_refs.append(ref)
    elif path.startswith("http.") or path.startswith("vault."):
        add(f"unsupported connector capability: {path}", node)
    elif path:
        root = path.split(".")[0]
        imported = import_bindings.get(root)
        if imported:
            canonical = imported + path[len(root):]
            module = next((name for name in SAFE_MODULE_CALLS if canonical == name or canonical.startswith(name + ".")), None)
            operation = canonical[len(module) + 1:].split(".")[0] if module and len(canonical) > len(module) else ""
            if not module or operation not in SAFE_MODULE_CALLS[module]:
                add(f"module call is not allowlisted: {canonical}", node)

assigned_result = any(isinstance(node, (ast.Assign, ast.AnnAssign)) and any(isinstance(target, ast.Name) and target.id == "result" for target in (node.targets if isinstance(node, ast.Assign) else [node.target])) for node in ast.walk(tree))
if not assigned_result:
    errors.append("connector must assign its final JSON-compatible value to result")

print(json.dumps({
    "ok": not errors,
    "errors": list(dict.fromkeys(errors)),
    "imports": imports,
    "networkCalls": network_calls,
    "vaultRefs": sorted(set(vault_refs)),
}))
