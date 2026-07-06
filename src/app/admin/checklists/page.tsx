'use client';
import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { color, spacing, radius, font } from '@/lib/theme';

type Template = {
  id: string;
  name: string;
  service_type: string | null;
  is_active: boolean;
  created_at: string;
};
type TemplateItem = {
  id: string;
  template_id: string;
  label: string;
  sort_order: number;
};

export default function AdminChecklistsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [itemsByTemplate, setItemsByTemplate] = useState<Record<string, TemplateItem[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newServiceType, setNewServiceType] = useState('');
  const [newItemLabel, setNewItemLabel] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: selError } = await supabase
        .from('checklist_templates')
        .select('id,name,service_type,is_active,created_at')
        .order('created_at', { ascending: false });
      if (selError) throw selError;
      setTemplates((data ?? []) as Template[]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(templateId: string) {
    setError(null);
    try {
      const { data, error: selError } = await supabase
        .from('checklist_template_items')
        .select('id,template_id,label,sort_order')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true });
      if (selError) throw selError;
      setItemsByTemplate((prev) => ({ ...prev, [templateId]: (data ?? []) as TemplateItem[] }));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { loadTemplates().catch(() => {}); }, []); // eslint-disable-line

  async function toggleExpand(templateId: string) {
    if (expandedId === templateId) { setExpandedId(null); return; }
    setExpandedId(templateId);
    if (!itemsByTemplate[templateId]) {
      await loadItems(templateId);
    }
  }

  async function createTemplate() {
    if (!newName.trim()) { setError('Template name is required.'); return; }
    setBusy(true);
    setError(null);
    try {
      const { error: insError } = await supabase.from('checklist_templates').insert({
        name: newName.trim(),
        service_type: newServiceType.trim() === '' ? null : newServiceType.trim(),
        is_active: true,
      });
      if (insError) throw insError;
      setNewName('');
      setNewServiceType('');
      await loadTemplates();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(t: Template) {
    setBusy(true);
    setError(null);
    try {
      const { error: updError } = await supabase
        .from('checklist_templates')
        .update({ is_active: !t.is_active })
        .eq('id', t.id);
      if (updError) throw updError;
      await loadTemplates();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm('Delete this template and all its items? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase.from('checklist_templates').delete().eq('id', templateId);
      if (delError) throw delError;
      if (expandedId === templateId) setExpandedId(null);
      await loadTemplates();
    } catch (e) {
      if ((e as any)?.code === '23503') {
        setError("This template has already been used on a job and can't be deleted — deactivate it instead.");
      } else {
        setError(String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function addItem(templateId: string) {
    const label = (newItemLabel[templateId] ?? '').trim();
    if (!label) return;
    setBusy(true);
    setError(null);
    try {
      const currentItems = itemsByTemplate[templateId] ?? [];
      const nextSortOrder = currentItems.length > 0 ? Math.max(...currentItems.map((i) => i.sort_order)) + 1 : 1;
      const { error: insError } = await supabase.from('checklist_template_items').insert({
        template_id: templateId,
        label,
        sort_order: nextSortOrder,
      });
      if (insError) throw insError;
      setNewItemLabel((prev) => ({ ...prev, [templateId]: '' }));
      await loadItems(templateId);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(itemId: string, templateId: string) {
    setBusy(true);
    setError(null);
    try {
      const { error: delError } = await supabase.from('checklist_template_items').delete().eq('id', itemId);
      if (delError) throw delError;
      await loadItems(templateId);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: radius.md ?? 6,
    border: `1px solid ${color.border}`,
    fontSize: font.size.sm,
  };
  const btnStyle: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: radius.md ?? 6,
    border: '1px solid #111827',
    background: '#111827',
    color: 'white',
    fontSize: font.size.sm,
    cursor: 'pointer',
  };
  const linkBtnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: color.textSecondary,
    cursor: 'pointer',
    fontSize: font.size.sm,
    textDecoration: 'underline',
    padding: 0,
  };

  return (
    <div>
      <h2 style={{ marginBottom: spacing.lg }}>Checklist Templates</h2>
      {error && (
        <div style={{ padding: 10, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: 8, marginBottom: spacing.lg }}>
          {error}
        </div>
      )}

      <section style={{ padding: spacing.lg, border: `1px solid ${color.border}`, borderRadius: radius.lg, marginBottom: spacing.xl }}>
        <h3 style={{ marginTop: 0 }}>New template</h3>
        <div style={{ display: 'flex', gap: spacing.md ?? 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={inputStyle}
            placeholder="Template name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Service type (blank = applies to any job)"
            value={newServiceType}
            onChange={(e) => setNewServiceType(e.target.value)}
          />
          <button style={btnStyle} disabled={busy} onClick={createTemplate}>
            {busy ? 'Saving…' : 'Create template'}
          </button>
        </div>
      </section>

      {loading ? (
        <div>Loading…</div>
      ) : templates.length === 0 ? (
        <div>No checklist templates yet. Create one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md ?? 10 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ padding: spacing.lg, border: `1px solid ${color.border}`, borderRadius: radius.lg }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{t.name}</strong>{' '}
                  <span style={{ color: color.textSecondary, fontSize: font.size.sm }}>
                    ({t.service_type ?? 'universal fallback'}) {t.is_active ? '' : '— inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: spacing.md ?? 10, alignItems: 'center' }}>
                  <button style={linkBtnStyle} onClick={() => toggleActive(t)} disabled={busy}>
                    {t.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button style={linkBtnStyle} onClick={() => toggleExpand(t.id)}>
                    {expandedId === t.id ? 'Hide items' : 'Show items'}
                  </button>
                  <button style={{ ...linkBtnStyle, color: '#b91c1c' }} onClick={() => deleteTemplate(t.id)} disabled={busy}>
                    Delete
                  </button>
                </div>
              </div>

              {expandedId === t.id && (
                <div style={{ marginTop: spacing.lg }}>
                  {(itemsByTemplate[t.id] ?? []).length === 0 ? (
                    <div style={{ color: color.textSecondary, fontSize: font.size.sm }}>No items yet.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {(itemsByTemplate[t.id] ?? []).map((item) => (
                        <li key={item.id} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: spacing.md ?? 10 }}>
                          <span>{item.label}</span>
                          <button style={{ ...linkBtnStyle, color: '#b91c1c' }} onClick={() => deleteItem(item.id, t.id)} disabled={busy}>
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: 'flex', gap: spacing.md ?? 10, marginTop: spacing.md ?? 10 }}>
                    <input
                      style={inputStyle}
                      placeholder="New item label"
                      value={newItemLabel[t.id] ?? ''}
                      onChange={(e) => setNewItemLabel((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    />
                    <button style={btnStyle} disabled={busy} onClick={() => addItem(t.id)}>
                      Add item
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
