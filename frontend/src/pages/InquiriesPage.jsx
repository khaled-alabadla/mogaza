import { ComplaintsLog } from './ComplaintsPage'

/** «الاستفسارات»: same log as the complaints, with the inquiry form. */
export default function InquiriesPage() {
  return <ComplaintsLog kind="inquiry" />
}
