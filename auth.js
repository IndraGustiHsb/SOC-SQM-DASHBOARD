(() => {
  'use strict';
  const SUPABASE_URL = 'https://bjylmkixcgdifmdpxicc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ouHhFZpuHKocinw_U8JN2Q_IibBN-zj';
  const client = window.socSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const loginScreen = document.getElementById('loginScreen');
  const appShell = document.getElementById('appShell');
  const form = document.getElementById('loginForm');
  const message = document.getElementById('loginMessage');
  const submit = document.getElementById('loginSubmit');
  let dashboardLoaded = false;

  function setMessage(text, type = '') {
    message.textContent = text;
    message.className = 'login-message' + (type ? ' ' + type : '');
  }
  function loadDashboard() {
    loginScreen.hidden = true;
    appShell.hidden = false;
    if (dashboardLoaded) return;
    dashboardLoaded = true;
    const script = document.createElement('script');
    script.src = 'app.js?v=20261124-kpi7';
    script.onerror = () => {
      dashboardLoaded = false;
      appShell.hidden = true;
      loginScreen.hidden = false;
      setMessage('Dashboard gagal dimuat. Periksa koneksi lalu coba kembali.', 'error');
    };
    document.body.appendChild(script);
  }
  function showLogin() {
    appShell.hidden = true;
    loginScreen.hidden = false;
    const password = document.getElementById('loginPassword');
    if (password) password.value = '';
    setMessage('Authorized personnel only.');
  }

  document.getElementById('togglePassword').addEventListener('click', () => {
    const input = document.getElementById('loginPassword');
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    document.getElementById('togglePassword').textContent = reveal ? 'HIDE' : 'SHOW';
    document.getElementById('togglePassword').setAttribute('aria-label', reveal ? 'Sembunyikan password' : 'Tampilkan password');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) return;
    submit.disabled = true;
    submit.querySelector('span').textContent = 'AUTHENTICATING...';
    setMessage('Memverifikasi akun melalui secure gateway...');
    const { error } = await client.auth.signInWithPassword({ email, password });
    submit.disabled = false;
    submit.querySelector('span').textContent = 'ACCESS DASHBOARD';
    if (error) {
      setMessage(error.message === 'Invalid login credentials' ? 'Email atau password tidak sesuai.' : error.message, 'error');
      return;
    }
    setMessage('Login berhasil. Membuka dashboard...', 'success');
    loadDashboard();
  });

  document.getElementById('logoutButton').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) setMessage('Gagal keluar: ' + error.message, 'error');
  });

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') showLogin();
    else if (event === 'SIGNED_IN' && session) loadDashboard();
  });

  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      showLogin();
      setMessage('Tidak dapat memeriksa sesi. Silakan login kembali.', 'error');
    } else if (data.session) loadDashboard();
    else showLogin();
  });
})();