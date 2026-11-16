import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, ShieldCheck, Tag, Trash2, X } from 'lucide-react';
import { confirmAction, showError } from './alerts';
import type { Category } from './types';

interface PreferencesPanelProps {
  categories: Category[];
  onAddCategory: () => void;
  onUpdateCategory: (id: string, data: { name: string; color: string }) => Promise<void>;
  onDeleteCategory: (category: Category) => Promise<void>;
}

export default function PreferencesPanel({ categories, onAddCategory, onUpdateCategory, onDeleteCategory }: PreferencesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveCategory(event: FormEvent<HTMLFormElement>, category: Category) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get('name') ?? '').trim();
    const color = String(values.get('color') ?? '');
    if (!name) return;
    setBusy(true);
    try {
      await onUpdateCategory(category.id, { name, color });
      setEditingId(null);
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : 'No se pudo actualizar la categoría.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(category: Category) {
    const confirmed = await confirmAction(
      `¿Eliminar «${category.name}»?`,
      'Solo se pueden eliminar categorías sin movimientos, reglas recurrentes ni presupuestos asociados.',
    );
    if (!confirmed) return;
    try {
      await onDeleteCategory(category);
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : 'No se pudo eliminar la categoría.');
    }
  }

  return (
    <div className="preferences-layout">
      <section className="panel full-panel preferences-panel">
        <div className="panel-heading">
          <div><h2>Categorías</h2><p>Edita nombre y color; el tipo se mantiene para proteger tus datos.</p></div>
          <button className="button button-primary" onClick={onAddCategory}><Plus size={16} /> Nueva categoría</button>
        </div>
        {categories.length ? <div className="settings-category-list">
          {categories.map((category) => <article className="settings-category" key={category.id}>
            <span className="settings-category-color" style={{ backgroundColor: category.color }} />
            {editingId === category.id ? <form className="settings-category-edit" onSubmit={(event) => void saveCategory(event, category)}>
              <label className="sr-only" htmlFor={`category-name-${category.id}`}>Nombre de categoría</label>
              <input id={`category-name-${category.id}`} name="name" required maxLength={40} defaultValue={category.name} autoFocus />
              <label className="sr-only" htmlFor={`category-color-${category.id}`}>Color de categoría</label>
              <input id={`category-color-${category.id}`} name="color" type="color" defaultValue={category.color} />
              <button className="icon-button settings-action" type="submit" disabled={busy} aria-label="Guardar cambios"><Check size={17} /></button>
              <button className="icon-button settings-action" type="button" onClick={() => setEditingId(null)} aria-label="Cancelar edición"><X size={17} /></button>
            </form> : <>
              <div className="settings-category-copy"><strong>{category.name}</strong><span>{category.type === 'INCOME' ? 'Ingreso' : 'Gasto'}</span></div>
              <button className="icon-button settings-action" onClick={() => setEditingId(category.id)} aria-label={`Editar ${category.name}`}><Pencil size={16} /></button>
              <button className="icon-button settings-action danger-action" onClick={() => void deleteCategory(category)} aria-label={`Eliminar ${category.name}`}><Trash2 size={16} /></button>
            </>}
          </article>)}
        </div> : <div className="empty-list"><span className="empty-icon"><Tag size={19} /></span><strong>Aún no hay categorías</strong><span>Crea una para clasificar tus movimientos.</span><button className="button button-primary" onClick={onAddCategory}><Plus size={15} /> Crear categoría</button></div>}
      </section>

      <section className="panel privacy-panel">
        <span className="privacy-icon"><ShieldCheck size={20} /></span>
        <div><h2>Privacidad y seguridad</h2><p>Esta versión no tiene inicio de sesión. Mantén el backend accesible solo desde tu equipo; CORS no sustituye la autenticación y no debes publicarlo en Internet.</p></div>
      </section>
    </div>
  );
}
