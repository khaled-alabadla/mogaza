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

/** Footer of a location / street card: edit + delete, or restore in the deleted view. */
export function RecordCardActions({ record, canEdit, deletedView, canRestore, onEdit, onDelete, onRestore }) {
  if (deletedView ? !canRestore : !canEdit) return null
  return (
    <div className="mt-4 flex justify-end gap-2 border-t border-line pt-3">
      {deletedView ? (
        <IconButton variant="btn-secondary" icon={RestoreIcon} onClick={() => onRestore(record)}>
          استعادة
        </IconButton>
      ) : (
        <>
          <EditButton onClick={() => onEdit(record)} />
          <DeleteButton onClick={() => onDelete(record)} />
        </>
      )}
    </div>
  )
}
