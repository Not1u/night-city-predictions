import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { digest, secret } from './passwords';
// Offline operator action only. Never offer a public "give me the code for this name" endpoint.
const [userId,ack]=process.argv.slice(2);
if(!userId||ack!=='--owner-verified')throw new Error('Usage: npm run account:claim -- USER_ID --owner-verified (verify ownership independently first)');
const db=new DatabaseSync(resolve(process.env.DATABASE_PATH??'.data/night-city.sqlite'),{open:true});
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  const row=db.prepare('SELECT id FROM users WHERE id=? AND disabled=0 AND provider_subject LIKE ? AND NOT EXISTS(SELECT 1 FROM password_credentials WHERE user_id=users.id)').get(userId,'appwrite:%');
  if(!row)throw new Error('No eligible legacy account. This command cannot reset password accounts.');
  const token=secret(),expiry=new Date(Date.now()+30*60000).toISOString();
  db.prepare('INSERT INTO account_claims(user_id,token_hash,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at').run(userId,digest(token),expiry);
  console.log(`One-use migration code (expires ${expiry}): ${token}`);
}finally{db.close();}
