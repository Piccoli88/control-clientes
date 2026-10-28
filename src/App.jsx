import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import './index.css';

// ---------- Utilidades ----------
const money = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);

const dateLabel = (date) =>
  new Date(date + 'T12:00:00').toLocaleDateString('es-AR');

const today = () => new Date().toLocaleDateString('en-CA');

const paidOf = (loan) =>
  loan.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

const balance = (loan) =>
  Number(loan.capital) + Number(loan.interest) - paidOf(loan);

const totalDebt = (client) =>
  client.loans.reduce((sum, loan) => sum + balance(loan), 0);

// Días de atraso: solo si el préstamo tiene vencimiento, ya pasó y todavía hay saldo
const daysLate = (loan) => {
  if (!loan.due_date || balance(loan) <= 0) return 0;
  const diff = Math.floor(
    (new Date(today() + 'T12:00:00') - new Date(loan.due_date + 'T12:00:00')) /
      86400000
  );
  return diff > 0 ? diff : 0;
};

const clientLate = (client) => client.loans.some((loan) => daysLate(loan) > 0);

const LATE_COLOR = '#c0392b';
const linkButton = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'inherit',
  textDecoration: 'underline',
  cursor: 'pointer',
  fontSize: '0.85rem',
};

const emptyForm = {
  name: '',
  phone: '',
  notes: '',
  capital: '',
  interest: '',
  dueDate: '',
  agreement: '',
  loanId: '',
  amount: '',
  payDate: '',
};

export default function App() {
  // ---------- Sesión ----------
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // ---------- Datos ----------
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // ---------- Formularios ----------
  // panel: null | 'newClient' | 'editClient' | 'newLoan' | 'editLoan' | 'pay'
  const [panel, setPanel] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingLoanId, setEditingLoanId] = useState(null);
  const setField = (key) => (event) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  // ---------- Sesión: escuchar entrada y salida ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ---------- Cargar clientes con sus préstamos y pagos ----------
  const loadData = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('clients')
      .select('*, loans(*, payments(*))')
      .order('name');

    if (loadError) {
      setError('No se pudieron cargar los datos: ' + loadError.message);
      setLoading(false);
      return;
    }

    setClients(
      data.map((client) => ({
        ...client,
        loans: (client.loans || [])
          .map((loan) => ({ ...loan, payments: loan.payments || [] }))
          .sort((a, b) => b.loan_date.localeCompare(a.loan_date)),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) {
      setLoading(true);
      loadData();
    } else {
      setClients([]);
      setSelectedId(null);
    }
  }, [session, loadData]);

  // ---------- Datos derivados ----------
  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(query) ||
        client.phone.includes(query)
    );
  }, [clients, search]);

  const lateClients = clients.filter(clientLate);

  const selected = clients.find((client) => client.id === selectedId);

  const openLoans = selected
    ? selected.loans.filter((loan) => balance(loan) > 0)
    : [];

  const activeLoanId = openLoans.some((loan) => loan.id === form.loanId)
    ? form.loanId
    : openLoans[0]?.id ?? '';

  const activeLoan = openLoans.find((loan) => loan.id === activeLoanId);

  const history = selected
    ? [
        {
          id: 'c-' + selected.id,
          date: new Date(selected.created_at).toLocaleDateString('en-CA'),
          type: 'Cliente creado',
          amount: 0,
        },
        ...selected.loans.map((loan) => ({
          id: 'l-' + loan.id,
          date: loan.loan_date,
          type: 'Préstamo registrado',
          amount: Number(loan.capital),
        })),
        ...selected.loans.flatMap((loan) =>
          loan.payments.map((payment) => ({
            id: 'p-' + payment.id,
            date: payment.payment_date,
            type: 'Pago recibido',
            amount: Number(payment.amount),
            paymentId: payment.id,
          }))
        ),
      ].sort((a, b) => b.date.localeCompare(a.date))
    : [];

  // ---------- Acciones ----------
  async function run(action) {
    setError('');
    const { error: actionError } = await action;
    if (actionError) {
      setError('No se pudo guardar: ' + actionError.message);
      return false;
    }
    await loadData();
    return true;
  }

  function closePanel() {
    setPanel(null);
    setForm(emptyForm);
    setEditingLoanId(null);
  }

  function selectClient(id) {
    setSelectedId(id);
    closePanel();
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError('');
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (loginError) {
      setAuthError('Email o contraseña incorrectos.');
      return;
    }
    setPassword('');
  }

  async function saveClient(event) {
    event.preventDefault();
    if (!form.name.trim()) return;

    const values = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      notes: form.notes.trim(),
    };

    if (panel === 'editClient') {
      if (await run(supabase.from('clients').update(values).eq('id', selected.id))) {
        closePanel();
      }
      return;
    }

    const { data, error: insertError } = await supabase
      .from('clients')
      .insert(values)
      .select()
      .single();

    if (insertError) {
      setError('No se pudo guardar: ' + insertError.message);
      return;
    }

    await loadData();
    setSearch('');
    selectClient(data.id);
  }

  async function removeClient() {
    if (
      !window.confirm(
        `¿Eliminar a ${selected.name}? Se borran también todos sus préstamos y pagos.`
      )
    )
      return;

    if (await run(supabase.from('clients').delete().eq('id', selected.id))) {
      setSelectedId(null);
      closePanel();
    }
  }

  async function saveLoan(event) {
    event.preventDefault();

    const capital = Number(form.capital);
    const interest = Number(form.interest) || 0;
    if (capital <= 0) return;

    const values = {
      capital,
      interest,
      due_date: form.dueDate || null,
      notes: form.agreement.trim(),
    };

    const action =
      panel === 'editLoan'
        ? supabase.from('loans').update(values).eq('id', editingLoanId)
        : supabase
            .from('loans')
            .insert({ ...values, client_id: selected.id, loan_date: today() });

    if (await run(action)) closePanel();
  }

  async function removeLoan(loan) {
    if (
      !window.confirm(
        `¿Eliminar el préstamo del ${dateLabel(loan.loan_date)}? Se borran también sus pagos.`
      )
    )
      return;
    await run(supabase.from('loans').delete().eq('id', loan.id));
  }

  async function savePayment(event) {
    event.preventDefault();

    const amount = Number(form.amount);
    if (!activeLoan || amount <= 0) return;

    // No se puede pagar más de lo que se debe en ese préstamo
    const applied = Math.min(amount, balance(activeLoan));

    const saved = await run(
      supabase.from('payments').insert({
        loan_id: activeLoan.id,
        amount: applied,
        payment_date: form.payDate || today(),
      })
    );
    if (saved) closePanel();
  }

  async function removePayment(paymentId) {
    if (!window.confirm('¿Eliminar este pago?')) return;
    await run(supabase.from('payments').delete().eq('id', paymentId));
  }

  function openEditClient() {
    setForm({
      ...emptyForm,
      name: selected.name,
      phone: selected.phone,
      notes: selected.notes,
    });
    setPanel('editClient');
  }

  function openEditLoan(loan) {
    setForm({
      ...emptyForm,
      capital: String(loan.capital),
      interest: String(loan.interest),
      dueDate: loan.due_date || '',
      agreement: loan.notes,
    });
    setEditingLoanId(loan.id);
    setPanel('editLoan');
  }

  // ---------- Pantalla de ingreso ----------
  if (!authReady) {
    return (
      <main className="app-shell">
        <p className="empty-state">Cargando...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-icon">C</div>
            <div>
              <strong>Control de clientes</strong>
              <span>Gestión de préstamos</span>
            </div>
          </div>
        </header>

        <section className="welcome">
          <h1>Ingresar</h1>
          <p>Usá tu email y contraseña para ver tus clientes.</p>
        </section>

        <form
          className="client-form"
          onSubmit={handleLogin}
          style={{ maxWidth: '420px', margin: '0 auto' }}
        >
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {authError && <p style={{ color: LATE_COLOR }}>{authError}</p>}
          <button className="primary-button" type="submit">
            Ingresar
          </button>
        </form>
      </main>
    );
  }

  // ---------- Pantalla principal ----------
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">C</div>
          <div>
            <strong>Control de clientes</strong>
            <span>Gestión de préstamos</span>
          </div>
        </div>
        <button className="primary-button" onClick={() => supabase.auth.signOut()}>
          Salir
        </button>
      </header>

      <section className="welcome">
        <p className="eyebrow">PANEL DE GESTIÓN</p>
        <h1>Clientes</h1>
        <p>Encontrá una ficha y consultá su historial.</p>
        {error && <p style={{ color: LATE_COLOR }}>{error}</p>}
      </section>

      <section className="workspace">
        <aside className="client-panel">
          <div className="panel-heading">
            <h2>Mis clientes</h2>
            <button
              className="primary-button"
              onClick={() => {
                if (panel === 'newClient') {
                  closePanel();
                } else {
                  setForm(emptyForm);
                  setPanel('newClient');
                }
              }}
            >
              + Agregar
            </button>
          </div>

          <input
            className="search-input"
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {lateClients.length > 0 && (
            <div className="notes-box">
              <strong style={{ color: LATE_COLOR }}>
                Atrasos ({lateClients.length})
              </strong>
              <p>
                {lateClients.map((client, index) => (
                  <span key={client.id}>
                    {index > 0 && ' · '}
                    <button
                      style={linkButton}
                      onClick={() => selectClient(client.id)}
                    >
                      {client.name}
                    </button>
                  </span>
                ))}
              </p>
            </div>
          )}

          {(panel === 'newClient' || panel === 'editClient') && (
            <form className="client-form" onSubmit={saveClient}>
              <h3>
                {panel === 'newClient' ? 'Nuevo cliente' : 'Editar cliente'}
              </h3>
              <label>
                Nombre completo *
                <input
                  required
                  value={form.name}
                  onChange={setField('name')}
                  placeholder="Ej. Carlos Rodríguez"
                />
              </label>
              <label>
                Teléfono
                <input
                  value={form.phone}
                  onChange={setField('phone')}
                  placeholder="Número de contacto"
                />
              </label>
              <label>
                Observaciones
                <textarea
                  value={form.notes}
                  onChange={setField('notes')}
                  placeholder="Notas opcionales"
                />
              </label>
              <button className="primary-button" type="submit">
                Guardar cliente
              </button>
            </form>
          )}

          <div className="client-list">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                className={`client-item ${
                  selectedId === client.id ? 'selected' : ''
                }`}
                onClick={() => selectClient(client.id)}
              >
                <span className="avatar">
                  {client.name.charAt(0).toUpperCase()}
                </span>
                <span className="client-item-text">
                  <strong>{client.name}</strong>
                  <small>{client.phone || 'Sin teléfono'}</small>
                  <small>{client.loans.length} préstamo(s)</small>
                  {clientLate(client) && (
                    <small style={{ color: LATE_COLOR }}>Atrasado</small>
                  )}
                </span>
                <span className="client-balance">
                  {money(totalDebt(client))}
                </span>
              </button>
            ))}

            {loading && <p className="empty-state">Cargando clientes...</p>}

            {!loading && clients.length === 0 && (
              <p className="empty-state">
                Todavía no cargaste clientes. Tocá «+ Agregar» para crear el
                primero.
              </p>
            )}

            {!loading && clients.length > 0 && filteredClients.length === 0 && (
              <p className="empty-state">
                No encontramos clientes con esa búsqueda.
              </p>
            )}
          </div>
        </aside>

        <section className="detail-panel">
          {!selected ? (
            <div className="empty-detail">
              <span className="large-icon">⌕</span>
              <h2>Seleccioná un cliente</h2>
              <p>Su ficha aparecerá en este espacio.</p>
            </div>
          ) : (
            <>
              <div className="profile-heading">
                <div className="avatar large">
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="eyebrow">FICHA</p>
                  <h2>{selected.name}</h2>
                  <p>{selected.phone || 'Sin teléfono registrado'}</p>
                  <p>
                    <button style={linkButton} onClick={openEditClient}>
                      Editar
                    </button>
                    {' · '}
                    <button
                      style={{ ...linkButton, color: LATE_COLOR }}
                      onClick={removeClient}
                    >
                      Eliminar cliente
                    </button>
                  </p>
                </div>
              </div>

              {selected.notes && (
                <div className="notes-box">
                  <strong>Observaciones</strong>
                  <p>{selected.notes}</p>
                </div>
              )}

              {/* Acciones del día */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  className="primary-button"
                  onClick={() => {
                    setForm(emptyForm);
                    setPanel('newLoan');
                  }}
                >
                  + Nuevo préstamo
                </button>
                <button
                  className="primary-button"
                  disabled={openLoans.length === 0}
                  onClick={() => {
                    setForm({ ...emptyForm, payDate: today() });
                    setPanel('pay');
                  }}
                >
                  Registrar pago
                </button>
              </div>

              {(panel === 'newLoan' || panel === 'editLoan') && (
                <form className="client-form" onSubmit={saveLoan}>
                  <h3>
                    {panel === 'newLoan'
                      ? `Nuevo préstamo para ${selected.name}`
                      : 'Editar préstamo'}
                  </h3>
                  <label>
                    Capital *
                    <input
                      required
                      type="number"
                      min="1"
                      value={form.capital}
                      onChange={setField('capital')}
                      placeholder="Monto prestado"
                    />
                  </label>
                  <label>
                    Interés
                    <input
                      type="number"
                      min="0"
                      value={form.interest}
                      onChange={setField('interest')}
                      placeholder="Monto de interés (lo definís vos)"
                    />
                  </label>
                  <label>
                    Vencimiento
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={setField('dueDate')}
                    />
                  </label>
                  <label>
                    Acuerdo
                    <textarea
                      value={form.agreement}
                      onChange={setField('agreement')}
                      placeholder="Ej. paga $5.000 por día, o en 4 cuotas semanales"
                    />
                  </label>
                  <button className="primary-button" type="submit">
                    Guardar préstamo
                  </button>
                </form>
              )}

              {panel === 'pay' && activeLoan && (
                <form className="client-form" onSubmit={savePayment}>
                  <h3>Registrar pago de {selected.name}</h3>
                  <label>
                    Préstamo
                    <select value={activeLoanId} onChange={setField('loanId')}>
                      {openLoans.map((loan) => (
                        <option key={loan.id} value={loan.id}>
                          Del {dateLabel(loan.loan_date)} · debe{' '}
                          {money(balance(loan))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Monto pagado *
                    <input
                      required
                      type="number"
                      min="1"
                      max={balance(activeLoan)}
                      value={form.amount}
                      onChange={setField('amount')}
                      placeholder={`Hasta ${money(balance(activeLoan))}`}
                    />
                  </label>
                  <label>
                    Fecha del pago
                    <input
                      type="date"
                      value={form.payDate}
                      onChange={setField('payDate')}
                    />
                  </label>
                  <button className="primary-button" type="submit">
                    Guardar pago
                  </button>
                </form>
              )}

              <h3>Resumen de préstamos</h3>

              <div className="loan-list">
                {selected.loans.length === 0 ? (
                  <div className="empty-state">
                    Este cliente todavía no tiene préstamos registrados.
                  </div>
                ) : (
                  selected.loans.map((loan) => {
                    const late = daysLate(loan);
                    return (
                      <article className="loan-card" key={loan.id}>
                        <div className="loan-title">
                          <strong>
                            Préstamo del {dateLabel(loan.loan_date)}
                          </strong>
                          <span>
                            <button
                              style={linkButton}
                              onClick={() => openEditLoan(loan)}
                            >
                              Editar
                            </button>
                            {' · '}
                            <button
                              style={{ ...linkButton, color: LATE_COLOR }}
                              onClick={() => removeLoan(loan)}
                            >
                              Eliminar
                            </button>
                          </span>
                        </div>
                        <div className="loan-grid">
                          <div>
                            <small>Capital</small>
                            <strong>{money(loan.capital)}</strong>
                          </div>
                          <div>
                            <small>Interés</small>
                            <strong>{money(loan.interest)}</strong>
                          </div>
                          <div>
                            <small>Pagado</small>
                            <strong>{money(paidOf(loan))}</strong>
                          </div>
                          <div>
                            <small>Saldo pendiente</small>
                            <strong className="debt">
                              {money(balance(loan))}
                            </strong>
                          </div>
                        </div>
                        {loan.due_date && (
                          <p
                            style={late ? { color: LATE_COLOR } : undefined}
                          >
                            {late
                              ? `Vencido el ${dateLabel(loan.due_date)} (hace ${late} día${late === 1 ? '' : 's'})`
                              : `Vence el ${dateLabel(loan.due_date)}`}
                          </p>
                        )}
                        {loan.notes && <p>Acuerdo: {loan.notes}</p>}
                      </article>
                    );
                  })
                )}
              </div>

              <div className="history-heading">
                <h3>Historial de movimientos</h3>
                <span>{history.length} movimientos</span>
              </div>

              <div className="history-list">
                {history.map((item) => (
                  <article className="history-item" key={item.id}>
                    <span className="history-dot" />
                    <div className="history-text">
                      <strong>{item.type}</strong>
                      <small>{dateLabel(item.date)}</small>
                      {item.paymentId && (
                        <button
                          style={{ ...linkButton, color: LATE_COLOR }}
                          onClick={() => removePayment(item.paymentId)}
                        >
                          Eliminar pago
                        </button>
                      )}
                    </div>
                    <strong
                      className={item.type === 'Pago recibido' ? 'positive' : ''}
                    >
                      {item.amount ? money(item.amount) : '—'}
                    </strong>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
