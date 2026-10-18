'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, DataColumn, DataRecord, DataTable } from '@/lib/api';

type ColumnType = DataColumn['type'];

function emptyValue(column: DataColumn) {
  return column.type === 'checkbox' ? false : null;
}

export default function TablesPage() {
  const [tables, setTables] = useState<DataTable[]>([]);
  const [selected, setSelected] = useState<DataTable | null>(null);
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [name, setName] = useState('');
  const [columnName, setColumnName] = useState('');
  const [columnType, setColumnType] = useState<ColumnType>('text');
  const [selectOptions, setSelectOptions] = useState('Todo, In progress, Done');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTables = useCallback(async () => {
    try {
      const result = await api<{ tables: DataTable[] }>('/tables');
      setTables(result.tables);
      const requestedTableId = new URLSearchParams(window.location.search).get('table_id');
      setSelected(current => (
        (requestedTableId && result.tables.find(table => table.id === requestedTableId))
        || (current && result.tables.find(table => table.id === current.id))
        || result.tables[0]
        || null
      ));
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes('token')) window.location.assign('/login');
      else setError(err instanceof Error ? err.message : 'Could not load tables');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async (tableId: string) => {
    try {
      const result = await api<{ records: DataRecord[] }>(`/tables/${tableId}/records?limit=500`);
      setRecords(result.records);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load records');
    }
  }, []);

  useEffect(() => { void loadTables(); }, [loadTables]);
  useEffect(() => {
    if (selected) void loadRecords(selected.id);
    else setRecords([]);
  }, [selected?.id, loadRecords]);

  async function createTable(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await api<{ table: DataTable }>('/tables', {
        method: 'POST',
        body: JSON.stringify({
          name,
          columns: [
            { name: 'Name', type: 'text' },
            { name: 'Status', type: 'select', options: ['Todo', 'In progress', 'Done'] },
          ],
        }),
      });
      setTables(current => [result.table, ...current]);
      setSelected(result.table);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create table');
    }
  }

  async function addColumn(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError('');
    try {
      const result = await api<{ table: DataTable }>(`/tables/${selected.id}/columns`, {
        method: 'POST',
        body: JSON.stringify({
          name: columnName,
          type: columnType,
          options: columnType === 'select' ? selectOptions.split(',').map(value => value.trim()).filter(Boolean) : [],
        }),
      });
      setSelected(result.table);
      setTables(current => current.map(table => table.id === result.table.id ? result.table : table));
      setColumnName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add column');
    }
  }

  async function addRecord() {
    if (!selected) return;
    setError('');
    try {
      const values = Object.fromEntries(selected.columns.map(column => [column.id, emptyValue(column)]));
      const result = await api<{ record: DataRecord }>(`/tables/${selected.id}/records`, {
        method: 'POST',
        body: JSON.stringify({ values }),
      });
      setRecords(current => [...current, result.record]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add record');
    }
  }

  async function updateCell(record: DataRecord, column: DataColumn, rawValue: string | boolean) {
    if (!selected) return;
    const value = column.type === 'number'
      ? rawValue === '' ? null : Number(rawValue)
      : rawValue === '' ? null : rawValue;
    if (column.type === 'number' && value !== null && !Number.isFinite(value)) {
      setError(`${column.name} must be a valid number`);
      return;
    }
    setError('');
    try {
      const result = await api<{ record: DataRecord }>(`/tables/${selected.id}/records/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: record.version, values: { [column.id]: value } }),
      });
      setRecords(current => current.map(item => item.id === record.id ? result.record : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save record');
    }
  }

  async function deleteRecord(record: DataRecord) {
    if (!selected || !window.confirm('Delete this record permanently?')) return;
    try {
      await api(`/tables/${selected.id}/records/${record.id}`, { method: 'DELETE' });
      setRecords(current => current.filter(item => item.id !== record.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete record');
    }
  }

  async function deleteTable(table: DataTable) {
    if (!window.confirm(`Delete “${table.name}” and all its records permanently?`)) return;
    try {
      await api(`/tables/${table.id}`, { method: 'DELETE' });
      setTables(current => current.filter(item => item.id !== table.id));
      setSelected(current => current?.id === table.id ? tables.find(item => item.id !== table.id) || null : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete table');
    }
  }

  async function renameTable(table: DataTable) {
    const nextName = window.prompt('Table name', table.name)?.trim();
    if (!nextName || nextName === table.name) return;
    try {
      const result = await api<{ table: DataTable }>(`/tables/${table.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nextName }),
      });
      setTables(current => current.map(item => item.id === table.id ? result.table : item));
      setSelected(result.table);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename table');
    }
  }

  function renderCell(record: DataRecord, column: DataColumn) {
    const value = record.values[column.id];
    if (column.type === 'checkbox') {
      return <input aria-label={column.name} type="checkbox" checked={value === true} onChange={event => { void updateCell(record, column, event.target.checked); }} />;
    }
    if (column.type === 'select') {
      return (
        <select aria-label={column.name} value={typeof value === 'string' ? value : ''} onChange={event => { void updateCell(record, column, event.target.value); }}>
          <option value="">—</option>
          {column.options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    return (
      <input
        aria-label={column.name}
        type={column.type === 'number' || column.type === 'date' ? column.type : 'text'}
        defaultValue={value === null || value === undefined ? '' : String(value)}
        onBlur={event => { if (event.currentTarget.value !== String(value ?? '')) void updateCell(record, column, event.currentTarget.value); }}
      />
    );
  }

  return (
    <main className="tables-shell">
      <header className="tables-topbar">
        <Link href="/" className="tables-brand">✦ Noteform</Link>
        <Link href="/" className="tables-back">← Back to pages</Link>
      </header>
      <div className="tables-layout">
        <aside className="tables-sidebar">
          <p className="nav-label">STRUCTURED DATA</p>
          {tables.map(table => (
            <button key={table.id} className={`nav-item ${selected?.id === table.id ? 'active' : ''}`} onClick={() => setSelected(table)}>
              <span>▦</span>{table.name}
            </button>
          ))}
          <form className="table-create-form" onSubmit={event => { void createTable(event); }}>
            <input aria-label="New table name" value={name} onChange={event => setName(event.target.value)} placeholder="New table name" required maxLength={120} />
            <button type="submit">＋ Create table</button>
          </form>
          <p className="tables-sidebar-foot">Your table data is private to your workspace.</p>
        </aside>
        <section className="table-content">
          {error && <div className="table-error" role="alert">{error}</div>}
          {loading ? <p className="muted">Loading tables…</p> : selected ? (
            <>
              <div className="table-heading">
                <div><p className="eyebrow">STRUCTURED DATA</p><h1>{selected.name}</h1><p className="muted">{records.length} records</p></div>
                <div className="table-heading-actions">
                  <button className="table-secondary-button" onClick={() => { void renameTable(selected); }}>Rename</button>
                  <button className="table-secondary-button" onClick={() => { void deleteTable(selected); }}>Delete table</button>
                  <button className="table-primary-button" onClick={() => { void addRecord(); }}>＋ New record</button>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-grid">
                  <thead><tr>{selected.columns.map(column => <th key={column.id}>{column.name}<small>{column.type}</small></th>)}<th aria-label="Row actions" /></tr></thead>
                  <tbody>
                    {records.map(record => (
                      <tr key={record.id}>
                        {selected.columns.map(column => <td key={`${column.id}-${record.version}`}>{renderCell(record, column)}</td>)}
                        <td><button className="record-delete-button" aria-label="Delete record" onClick={() => { void deleteRecord(record); }}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {records.length === 0 && <p className="table-empty">No records yet. Create a record to start filling this table.</p>}
              </div>
              <form className="add-column-form" onSubmit={event => { void addColumn(event); }}>
                <strong>Add a column</strong>
                <input aria-label="Column name" value={columnName} onChange={event => setColumnName(event.target.value)} placeholder="Column name" required maxLength={80} />
                <select aria-label="Column type" value={columnType} onChange={event => setColumnType(event.target.value as ColumnType)}>
                  <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="checkbox">Checkbox</option><option value="select">Select</option>
                </select>
                {columnType === 'select' && <input aria-label="Select options" value={selectOptions} onChange={event => setSelectOptions(event.target.value)} placeholder="Options, comma separated" />}
                <button type="submit">＋ Add column</button>
              </form>
              <p className="table-mcp-hint">MCP clients can read and update this table using <code>get_table</code>, <code>list_table_records</code>, and the table record tools. CSV/Excel import and Markdown ZIP export for tables are not included yet.</p>
            </>
          ) : (
            <div className="table-empty-state"><span>▦</span><h1>Your structured data</h1><p>Create a table to organize records with typed columns.</p></div>
          )}
        </section>
      </div>
    </main>
  );
}
