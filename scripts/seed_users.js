/**
 * MYBENGKEL - SUPABASE USER PROVISIONING CLI SCRIPT
 * Usage:
 *   node scripts/seed_users.js
 * Requires:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or environment variables.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Read .env if available
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
}

loadEnv();

const rawSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!rawSupabaseUrl) {
  console.error('Error: VITE_SUPABASE_URL belum terdefinisi di file .env.');
  process.exit(1);
}

const supabaseUrl = rawSupabaseUrl
  .trim()
  .replace(/\/+$/, '')
  .replace(/\.supabase\.com$/i, '.supabase.co');

if (!serviceRoleKey) {
  console.warn('\nCatatan: SUPABASE_SERVICE_ROLE_KEY belum diisi di file .env.');
  console.warn('Untuk membuat akun langsung melalui API Supabase Admin, service role key diperlukan.');
  console.warn('Alternatif termudah: Jalankan langsung file "supabase/seed_users.sql" di SQL Editor Supabase Dashboard.\n');
  process.exit(0);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ACCOUNTS = [
  {
    email: 'mybenngkeladmin@mybengkel.com',
    password: 'admin!@#',
    pin: '123456789012',
    name: 'Admin MyBengkel',
    role: 'admin',
  },
  {
    email: 'masteradminmybengkel@mybengkel.com',
    password: 'masteradmin!@#',
    pin: '012345678912',
    name: 'Master Admin MyBengkel',
    role: 'master_admin',
  },
  {
    email: 'helpdeskmybengkel@mybengkel.com',
    password: 'helpdesk!@#',
    pin: '123456789012',
    name: 'Master Helpdesk MyBengkel',
    role: 'master_helpdesk',
  },
];

async function seed() {
  console.log('Memulai pembuatan akun di Supabase Auth...');

  for (const acc of ACCOUNTS) {
    console.log(`\nMemproses ${acc.email} (${acc.role})...`);

    // 1. Create or invite user
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: acc.email,
      password: acc.password,
      email_confirm: true,
      user_metadata: {
        name: acc.name,
        role: acc.role,
      },
    });

    if (userError) {
      if (userError.message.toLowerCase().includes('already registered')) {
        console.log(`Akun ${acc.email} sudah terdaftar. Mengupdate password...`);
        // Find user by list
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existing = listData?.users?.find((u) => u.email?.toLowerCase() === acc.email.toLowerCase());
        if (existing) {
          await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password: acc.password,
            email_confirm: true,
            user_metadata: { name: acc.name, role: acc.role },
          });
          // Update user_roles table
          await supabaseAdmin.from('user_roles').upsert({
            user_id: existing.id,
            role: acc.role,
          });
          console.log(`Peran dan password ${acc.email} diperbarui.`);
        }
      } else {
        console.error(`Gagal membuat akun ${acc.email}:`, userError.message);
      }
    } else if (userData?.user) {
      console.log(`Akun ${acc.email} tercatat di auth.users dengan ID: ${userData.user.id}`);
      // Insert role
      const { error: roleError } = await supabaseAdmin.from('user_roles').upsert({
        user_id: userData.user.id,
        role: acc.role,
      });
      if (roleError) {
        console.error(`Gagal mencatat role untuk ${acc.email}:`, roleError.message);
      } else {
        console.log(`Role ${acc.role} terdaftar di public.user_roles.`);
      }
    }
  }

  console.log('\nProses selesai.');
}

seed().catch(console.error);

