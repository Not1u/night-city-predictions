import { spawnSync } from 'node:child_process';
const run=(args)=>{const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,VITE_DATA_MODE:'api',VITE_AUTH_MODE:'password',VITE_API_BASE_URL:'',VITE_APPWRITE_ENDPOINT:'',VITE_APPWRITE_PROJECT_ID:''}});if(result.status!==0)process.exit(result.status??1);};
run(['node_modules/vite/bin/vite.js','build','apps/web','--base','/']);
