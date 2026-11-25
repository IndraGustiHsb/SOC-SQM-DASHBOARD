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
    script.src = 'app.js?v=20261126-hide-e2e-kpi';
    script.onload = () => {
      // Ensure screenshot control exists even if the dashboard bundle is cached or initialized late.
      const topStatus = document.querySelector('.topbar .top-status');
      if (topStatus && !document.getElementById('captureDashboard')) {
        const shot = document.createElement('button');
        shot.id = 'captureDashboard';
        shot.type = 'button';
        shot.title = 'Ambil screenshot seluruh dashboard';
        shot.setAttribute('aria-label', 'Screenshot dashboard');
        shot.innerHTML = '<span aria-hidden="true">▣</span> SCREENSHOT';
        shot.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:108px;height:32px;margin:0 8px;padding:0 10px;border:1px solid #087fb8;border-radius:7px;background:#062b47;color:#45d9ff;font:700 10px Arial,sans-serif;cursor:pointer;position:relative;z-index:20;visibility:visible;opacity:1';
        const logout = document.getElementById('logoutButton');
        topStatus.insertBefore(shot, logout || null);
      }
      const shotButton = document.getElementById('captureDashboard');
      if (shotButton && shotButton.dataset.bound !== '1') {
        shotButton.dataset.bound = '1';
        shotButton.addEventListener('click', async () => {
          if (typeof window.html2canvas !== 'function') {
            alert('Library screenshot belum termuat. Muat ulang halaman dengan Ctrl + F5.');
            return;
          }
          const target = document.getElementById('dashboardView');
          if (!target) return;
          shotButton.disabled = true;
          try {
            const canvas = await window.html2canvas(target, {
              backgroundColor: '#030b16', scale: Math.min(2, window.devicePixelRatio || 1),
              useCORS: true, logging: false, scrollX: 0, scrollY: 0,
              windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
              windowHeight: Math.max(target.scrollHeight, target.offsetHeight),
              onclone: (clonedDoc) => {
                const captureArea = clonedDoc.getElementById('dashboardView');
                if (captureArea) {
                  captureArea.querySelector('.filters')?.remove();
                  captureArea.querySelector('.table-panel')?.remove();
                  captureArea.querySelectorAll(':scope > section:not(#activeFilterSummary):not(#kpis):not(#charts)').forEach(node => node.remove());
                  captureArea.style.paddingTop = '0';
                  captureArea.style.height = 'auto';
                  captureArea.style.minHeight = '0';
                  captureArea.style.overflow = 'visible';
                }
                clonedDoc.body.style.background = '#030b16';
              }
            });
            const link = document.createElement('a');
            link.download = 'SOC-SQM-Dashboard-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
          } catch (error) {
            console.error('Screenshot failed:', error);
            alert('Screenshot gagal dibuat. Silakan coba lagi.');
          } finally { shotButton.disabled = false; }
        });
      }
      const deleteScript = document.createElement('script');
      deleteScript.src = 'raw-data-delete.js?v=20261125-1';
      document.body.appendChild(deleteScript);
    };
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