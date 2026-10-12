import { createFileRoute } from '@tanstack/react-router'
import { appRouteEntry, isAppRoute } from '@gadgets/workshop-shared/app-host'
import { useShowGatekeeperApp } from '../KeptGatekeeperApp'
import { useDocumentTitle } from '../useDocumentTitle'
import { useGatekeeperApps } from '../useGatekeeperApps'

type GatekeeperAppSearch = {
  /** The app's own route (see app-host.ts): restores the screen on reload and deep-links launcher picks. */
  at?: string
}

/**
 * Generic host for any gatekeeper-served management app (VendorDescription.providesUi). The set of
 * apps and their nav entries come from the backend (useGatekeeperApps); nothing about a specific
 * gatekeeper is hardcoded here. The app itself is rendered by the shell (KeptGatekeeperApp), which
 * keeps it mounted after the user leaves this route; this route only puts it on screen at `at`.
 * GatekeeperAppPage renders "not available" if the id isn't bound.
 *
 * The file is `gatekeepers_.$appId` (trailing underscore) so the URL is /gatekeepers/$appId without
 * nesting inside the /gatekeepers connectors page's component.
 */
export const Route = createFileRoute('/gatekeepers_/$appId')({
  validateSearch: (search: Record<string, unknown>): GatekeeperAppSearch => ({
    at: isAppRoute(search.at) && search.at ? search.at : undefined,
  }),
  component: GatekeeperApp,
})

function GatekeeperApp() {
  const { appId } = Route.useParams()
  const { at } = Route.useSearch()
  const app = useGatekeeperApps().find((a) => a.id === appId)
  const entry = app?.entries?.find((candidate) => candidate.id === appRouteEntry(at))
  useDocumentTitle(entry?.title ?? app?.title ?? 'App')
  useShowGatekeeperApp(appId, at ?? '')
  return null
}
