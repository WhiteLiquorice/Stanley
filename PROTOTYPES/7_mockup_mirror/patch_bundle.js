const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'assets', 'index-CEWLV0u9.js');
let code = fs.readFileSync(jsPath, 'utf8');

// 1. Disable redirectToLogin
console.log('Patching redirectToLogin...');
code = code.replace('redirectToLogin(i){', 'redirectToLogin(i){console.log("Bypassed redirect to login");return;');

// 2. Mock isAuthenticated to always resolve to true
console.log('Patching isAuthenticated check...');
// Looking for isAuthenticated() implementation or references.
// Let's replace the setTimeout check:
// "await L.auth.isAuthenticated()||L.auth.redirectToLogin(window.location.href)"
// Let's replace L.auth.redirectToLogin with a noop in the query block
code = code.replace(/await L\.auth\.isAuthenticated\(\)\|\|L\.auth\.redirectToLogin\([^)]*\)/g, 'true');
code = code.replace(/ct\.auth\.redirectToLogin\([^)]*\)/g, 'console.log("Bypassed ct.auth.redirectToLogin")');

fs.writeFileSync(jsPath, code);
console.log('Bundle patched successfully!');
