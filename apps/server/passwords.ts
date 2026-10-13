import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { ApiError } from '@night-city/contracts';
// OWASP scrypt equivalent cost: N=2^14,r=8,p=5. Native async work, bounded concurrency.
let hashing=0;
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,32,{N:16384,r:8,p:5,maxmem:32*1024*1024},(e,key)=>e?reject(e):resolve(key)));
export function validatePassword(value:unknown):string {
  if(typeof value!=='string'||value.length<12||value.length>128||Buffer.byteLength(value)>512)throw new ApiError('INVALID_INPUT','密码需要 12–128 位，建议使用不重复的长密码');
  return value;
}
export async function passwordHash(password:string,salt=randomBytes(16).toString('hex')) {
  if(hashing>=2)throw new ApiError('RATE_LIMITED','登录请求较多，请稍后重试',429);
  hashing++;try{return `scrypt-v1$${salt}$${(await derive(password,salt)).toString('hex')}`;}finally{hashing--;}
}
export async function passwordMatches(password:string,encoded:string) {
  const parts=encoded.split('$');if(parts.length!==3||parts[0]!=='scrypt-v1'||!(/^[a-f0-9]{32}$/).test(parts[1])||!(/^[a-f0-9]{64}$/).test(parts[2]))return false;
  const actual=await passwordHash(password,parts[1]);return timingSafeEqual(Buffer.from(actual),Buffer.from(encoded));
}
export const secret=()=>randomBytes(32).toString('base64url');
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function secretMatches(raw:string,hash:string){const expected=Buffer.from(hash,'hex'),actual=Buffer.from(digest(raw),'hex');return expected.length===actual.length&&timingSafeEqual(actual,expected);}
