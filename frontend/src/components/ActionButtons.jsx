import { EditIcon, PlusIcon, RestoreIcon, TrashIcon } from './Icons'

function IconButton({ variant, icon: Icon, onClick, children }) {
  return (
    <button type="button" className={`btn ${variant}`} onClick={onClick}>
      <Icon className="h-4 w-4" /> {children}
    </button>
  )
}

export const AddButton = ({ onClick, children }) => (
  <IconButton variant="btn-primary" icon={PlusIcon} onClick={onClick}>
    {children}
  </IconButton>
)

export const EditButton = ({ onClick }) => (
  <IconButton variant="btn-secondary" icon={EditIcon} onClick={onClick}>
    تعديل
  </IconButton>
)

export const DeleteButton = ({ onClick }) => (
  <IconButton variant="btn-ghost-danger" icon={TrashIcon} onClick={onClick}>
    حذف
  </IconButton>
)

function IconAction({ label, icon: Icon, danger, onClick }) {
  return (
    <button type="button" className={`icon-action ${danger ? 'icon-action-danger' : ''}`} onClick={onClick} aria-label={label} title={label}>
      <Icon className="h-[1.1rem] w-[1.1rem]" />
    </button>
  )
}

/** The compact actions of a location / street card: edit + delete, or restore in the deleted view. */
export function RecordCardActions({ record, canEdit, deletedView, canRestore, onEdit, onDelete, onRestore }) {
  if (deletedView ? !canRestore : !canEdit) return null
  return (
    <div className="flex shrink-0 gap-0.5 print:hidden">
      {deletedView ? (
        <IconButton variant="btn-secondary" icon={RestoreIcon} onClick={() => onRestore(record)}>
          استعادة
        </IconButton>
      ) : (
        <>
          <IconAction label="تعديل" icon={EditIcon} onClick={() => onEdit(record)} />
          <IconAction label="حذف" icon={TrashIcon} danger onClick={() => onDelete(record)} />
        </>
      )}
    </div>
  )
}
