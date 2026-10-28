import { useEffect, useMemo, useState } from 'react';
import './index.css';

const STORAGE_KEY = 'control-clientes-v1';

function loadClients() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const money = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);

const dateLabel = (date) =>
  new Date(date + 'T12:00:00').toLocaleDateString('es-AR');

const today = () => new Date().toLocaleDateString('en-CA');

function balance(loan) {
  return loan.capital + loan.interest - loan.paid;
}

const totalDebt = (client) =>
  client.loans.reduce((sum, loan) => sum + balance(loan), 0);

export default function App() {
  // ---- Estado ----
  const [clients, setClients] = useState(loadClients);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [showLoanForm, setShowLoanForm] = useState(false);
  const [loanCapital, setLoanCapital] = useState('');
  const [loanInterest, setLoanInterest] = useState('');

  const [showPayForm, setShowPayForm] = useState(false);
  const [payLoanId, setPayLoanId] = useState('');
  const [payAmount, setPayAmount] = useState('');

  // ---- Guardado automático en este navegador ----
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
    } catch {
      // si el navegador no permite guardar, la app sigue funcionando
    }
  }, [clients]);

  // ---- Datos derivados ----
  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();

    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(query) ||
        client.phone.includes(query) ||
        String(client.id).includes(query)
    );
  }, [clients, search]);

  const selected = clients.find((client) => client.id === selectedId);

  const openLoans = selected
    ? selected.loans.filter((loan) => balance(loan) > 0)
    : [];

  const activeLoanId = openLoans.some((loan) => String(loan.id) === payLoanId)
    ? payLoanId
    : String(openLoans[0]?.id ?? '');

  const activeLoan = openLoans.find((loan) => String(loan.id) === activeLoanId);

  // ---- Acciones ----
  function updateSelected(change) {
    setClients((previous) =>
      previous.map((client) => (client.id === selectedId ? change(client) : client))
    );
  }

  function selectClient(id) {
    setSelectedId(id);
    setShowLoanForm(false);
    setShowPayForm(false);
  }

  function addClient(event) {
    event.preventDefault();

    if (!name.trim()) return;

    const id = Date.now();
    const client = {
      id,
      name: name.trim(),
      phone: phone.trim(),
      notes: notes.trim(),
      loans: [],
      history: [
        { id: id + 1, date: today(), type: 'Cliente creado', amount: 0 },
      ],
    };

    setClients((previous) => [...previous, client]);
    selectClient(id);
    setSearch('');
    setName('');
    setPhone('');
    setNotes('');
    setShowForm(false);
  }

  function addLoan(event) {
    event.preventDefault();

    const capital = Number(loanCapital);
    const interest = Number(loanInterest) || 0;
    if (!selected || capital <= 0) return;

    const id = Date.now();
    const date = today();

    updateSelected((client) => ({
      ...client,
      loans: [...client.loans, { id, capital, interest, paid: 0, date }],
      history: [
        ...client.history,
        { id: id + 1, date, type: 'Préstamo registrado', amount: capital },
      ],
    }));

    setLoanCapital('');
    setLoanInterest('');
    setShowLoanForm(false);
  }

  function addPayment(event) {
    event.preventDefault();

    const amount = Number(payAmount);
    if (!activeLoan || amount <= 0) return;

    // No se puede pagar más de lo que se debe en ese préstamo
    const applied = Math.min(amount, balance(activeLoan));
    const date = today();

    updateSelected((client) => ({
      ...client,
      loans: client.loans.map((loan) =>
        loan.id === activeLoan.id ? { ...loan, paid: loan.paid + applied } : loan
      ),
      history: [
        ...client.history,
        { id: Date.now(), date, type: 'Pago recibido', amount: applied },
      ],
    }));

    setPayAmount('');
    setShowPayForm(false);
  }

  // ---- Pantalla ----
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
        <p className="eyebrow">PANEL DE GESTIÓN</p>
        <h1>Clientes</h1>
        <p>Encontrá una ficha y consultá su historial.</p>
      </section>

      <section className="workspace">
        <aside className="client-panel">
          <div className="panel-heading">
            <h2>Mis clientes</h2>
            <button
              className="primary-button"
              onClick={() => setShowForm(!showForm)}
            >
              + Agregar
            </button>
          </div>

          <input
            className="search-input"
            placeholder="Buscar por nombre, teléfono o ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {showForm && (
            <form className="client-form" onSubmit={addClient}>
              <h3>Nuevo cliente</h3>
              <label>
                Nombre completo *
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Carlos Rodríguez"
                />
              </label>
              <label>
                Teléfono
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="Número de contacto"
                />
              </label>
              <label>
                Observaciones
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
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
                </span>
                <span className="client-balance">
                  {money(totalDebt(client))}
                </span>
              </button>
            ))}

            {clients.length === 0 && (
              <p className="empty-state">
                Todavía no cargaste clientes. Tocá «+ Agregar» para crear el
                primero.
              </p>
            )}

            {clients.length > 0 && filteredClients.length === 0 && (
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
                  <p className="eyebrow">FICHA #{selected.id}</p>
                  <h2>{selected.name}</h2>
                  <p>{selected.phone || 'Sin teléfono registrado'}</p>
                </div>
              </div>

              {selected.notes && (
                <div className="notes-box">
                  <strong>Observaciones</strong>
                  <p>{selected.notes}</p>
                </div>
              )}

              {/* Acciones del día: nueva deuda o pago */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  className="primary-button"
                  onClick={() => {
                    setShowLoanForm(!showLoanForm);
                    setShowPayForm(false);
                  }}
                >
                  + Nuevo préstamo
                </button>
                <button
                  className="primary-button"
                  disabled={openLoans.length === 0}
                  onClick={() => {
                    setShowPayForm(!showPayForm);
                    setShowLoanForm(false);
                  }}
                >
                  Registrar pago
                </button>
              </div>

              {showLoanForm && (
                <form className="client-form" onSubmit={addLoan}>
                  <h3>Nuevo préstamo para {selected.name}</h3>
                  <label>
                    Capital *
                    <input
                      required
                      type="number"
                      min="1"
                      value={loanCapital}
                      onChange={(event) => setLoanCapital(event.target.value)}
                      placeholder="Monto prestado"
                    />
                  </label>
                  <label>
                    Interés
                    <input
                      type="number"
                      min="0"
                      value={loanInterest}
                      onChange={(event) => setLoanInterest(event.target.value)}
                      placeholder="Monto de interés (opcional)"
                    />
                  </label>
                  <button className="primary-button" type="submit">
                    Guardar préstamo
                  </button>
                </form>
              )}

              {showPayForm && activeLoan && (
                <form className="client-form" onSubmit={addPayment}>
                  <h3>Registrar pago de {selected.name}</h3>
                  <label>
                    Préstamo
                    <select
                      value={activeLoanId}
                      onChange={(event) => setPayLoanId(event.target.value)}
                    >
                      {openLoans.map((loan) => (
                        <option key={loan.id} value={loan.id}>
                          #{loan.id} · {dateLabel(loan.date)} · debe{' '}
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
                      value={payAmount}
                      onChange={(event) => setPayAmount(event.target.value)}
                      placeholder={`Hasta ${money(balance(activeLoan))}`}
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
                  selected.loans.map((loan) => (
                    <article className="loan-card" key={loan.id}>
                      <div className="loan-title">
                        <strong>Préstamo #{loan.id}</strong>
                        <span>{dateLabel(loan.date)}</span>
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
                          <strong>{money(loan.paid)}</strong>
                        </div>
                        <div>
                          <small>Saldo pendiente</small>
                          <strong className="debt">
                            {money(balance(loan))}
                          </strong>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="history-heading">
                <h3>Historial de movimientos</h3>
                <span>{selected.history.length} movimientos</span>
              </div>

              <div className="history-list">
                {[...selected.history]
                  .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
                  .map((item) => (
                    <article className="history-item" key={item.id}>
                      <span className="history-dot" />
                      <div className="history-text">
                        <strong>{item.type}</strong>
                        <small>{dateLabel(item.date)}</small>
                      </div>
                      <strong
                        className={
                          item.type === 'Pago recibido' ? 'positive' : ''
                        }
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

