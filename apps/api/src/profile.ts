import { ApiError, type User } from '@night-city/contracts';
import { jsonBody, username } from './input';
export async function updateProfile(request:Request,db:D1Database,user:User){
  const name=username((await jsonBody(request)).display_name);
  try {await db.batch([db.prepare('UPDATE users SET display_name=?,username_key=? WHERE id=?').bind(name,name.toLowerCase(),user.id)]);}
  catch(e){if(String(e).includes('UNIQUE'))throw new ApiError('INVALID_INPUT','这个用户名已经有人使用，换一个试试',409);throw e;}
  return {...user,display_name:name};
}
