import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const defaultPassword = process.env.DEV_DEFAULT_PASSWORD || 'password123';

const users = [
  { username: 'consultant1', fullName: 'Consultant One', role: 'consultant' },
  { username: 'psych1', fullName: 'Psychologist One', role: 'psychologist' },
  { username: 'supervisor1', fullName: 'Supervisor One', role: 'supervisor' },
];

const seed = async () => {
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  for (const user of users) {
    await pool.query(
      `insert into profiles (username, password_hash, full_name, role)
       values ($1, $2, $3, $4)
       on conflict (username)
       do update set
         full_name = excluded.full_name,
         role = excluded.role`,
      [user.username, passwordHash, user.fullName, user.role],
    );
  }

  console.log(`Seeded dev users. Default password: ${defaultPassword}`);
};

seed()
  .catch((error) => {
    console.error('Failed seeding users:', error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
