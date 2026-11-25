(() => {
  'use strict';
  const button = document.getElementById('deleteAllRawData');
  const status = document.getElementById('rawDeleteStatus');
  if (!button || !status) return;

  button.addEventListener('click', async () => {
    const first = window.confirm('PERINGATAN: Seluruh RAW DATA Wilayah dan SGW di Supabase akan dihapus permanen. Struktur tabel dan akun tetap ada. Lanjutkan?');
    if (!first) return;
    const phrase = window.prompt('Ketik HAPUS RAW DATA untuk mengonfirmasi penghapusan seluruh data:');
    if (phrase !== 'HAPUS RAW DATA') {
      status.textContent = 'Penghapusan dibatalkan. Tidak ada data yang diubah.';
      return;
    }

    button.disabled = true;
    button.textContent = 'MENGHAPUS DATA...';
    status.textContent = 'Menghapus RAW DATA Wilayah dan SGW dari Supabase...';
    try {
      const client = window.socSupabase;
      if (!client) throw new Error('Koneksi Supabase tidak tersedia. Silakan login ulang.');

      // Delete only records from the two raw-data tables. Keep table definitions and upload history.
      const wilayah = await client.from('raw_data_wilayah').delete().not('id', 'is', null);
      if (wilayah.error) throw new Error('Gagal menghapus RAW DATA Wilayah: ' + wilayah.error.message);

      const sgw = await client.from('raw_data_sgw').delete().not('id', 'is', null);
      if (sgw.error) throw new Error('Gagal menghapus RAW DATA SGW: ' + sgw.error.message);

      status.textContent = 'Berhasil: seluruh RAW DATA Wilayah dan SGW telah dikosongkan. Struktur tabel dan akun tetap aman. Dashboard akan dimuat ulang.';
      button.textContent = 'DATA BERHASIL DIHAPUS';
      window.setTimeout(() => window.location.reload(), 1400);
    } catch (error) {
      console.error('Raw data deletion error:', error);
      status.textContent = error.message + ' Periksa Supabase RLS: user yang login harus memiliki izin DELETE pada kedua tabel.';
      button.disabled = false;
      button.textContent = '🗑 DELETE ALL RAW DATA';
    }
  });
})();