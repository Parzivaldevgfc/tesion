const form = document.getElementById('order-form');
const totalEl = document.getElementById('total');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submit-btn');
document.getElementById('year').textContent = new Date().getFullYear();

const fields = ['pages','copies','color','sides','binding','paper','cover','delivery','speed'];
const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

function getOptions() {
  const data = new FormData(form);
  const obj = {};
  fields.forEach(k => { obj[k] = data.get(k); });
  return obj;
}

function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.classList.toggle('loading', loading);
  submitBtn.disabled = !!loading;
}

function updateAddressRequirement() {
  const delivery = (new FormData(form)).get('delivery');
  const address = document.getElementById('address');
  if (!address) return;
  if (delivery === 'spedizione') {
    address.required = true;
    address.placeholder = 'Inserisci indirizzo completo (richiesto)';
  } else {
    address.required = false;
    address.placeholder = 'Richiesto per spedizione';
  }
}

async function refreshQuote() {
  try {
    const opts = getOptions();
    const res = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Errore preventivo');
    totalEl.textContent = euro.format(Number(json.total || 0));
  } catch (_e) {
    totalEl.textContent = '—';
  }
}

form.addEventListener('input', (e) => {
  if (e.target.name && fields.includes(e.target.name)) refreshQuote();
  if (e.target.name === 'delivery') updateAddressRequirement();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.classList.remove('error','success');
  statusEl.textContent = '';
  setLoading(true);
  try {
    const data = new FormData(form);
    const res = await fetch('/api/order', { method: 'POST', body: data });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Errore invio');
    statusEl.classList.add('success');
    statusEl.textContent = `Ordine ricevuto! Codice: ${json.id}. Totale: ${euro.format(Number(json.total || 0))}`;
    form.reset();
    updateAddressRequirement();
    refreshQuote();
  } catch (err) {
    statusEl.classList.add('error');
    statusEl.textContent = err.message;
  } finally {
    setLoading(false);
  }
});

// initial
updateAddressRequirement();
refreshQuote();

