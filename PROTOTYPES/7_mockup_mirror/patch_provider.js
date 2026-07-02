const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, 'assets', 'index-CEWLV0u9.js');
let code = fs.readFileSync(jsPath, 'utf8');

const targetStr = 'value:{user:t,isAuthenticated:r,isLoadingAuth:a,isLoadingPublicSettings:u,authError:h,appPublicSettings:_,authChecked:y';
const replacementStr = 'value:{user:{email:"teacher@school.edu",name:"Teacher Mom"},isAuthenticated:true,isLoadingAuth:false,isLoadingPublicSettings:false,authError:null,appPublicSettings:_,authChecked:true';

if (code.includes(targetStr)) {
  console.log('Target string found. Replacing...');
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync(jsPath, code);
  console.log('AuthProvider patched successfully!');
} else {
  console.log('Target string NOT found! Match failed.');
}
