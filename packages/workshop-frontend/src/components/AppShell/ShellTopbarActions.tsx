import InboxBell from '../Inbox/InboxBell'
import { SpotlightTrigger } from '../Spotlight/Spotlight'

// The search field and the inbox bell on the right of the top bar, beside the reconnecting chip.
const ShellTopbarActions = () => (
  <div className="relative flex items-center gap-2">
    <SpotlightTrigger />
    <InboxBell />
  </div>
)

export default ShellTopbarActions
