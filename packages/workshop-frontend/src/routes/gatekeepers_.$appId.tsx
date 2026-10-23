import { useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { isAppRoute, type AppRouteMode } from '@gadgets/workshop-shared/app-host'
import GatekeeperAppPage from '../GatekeeperAppPage'
import { useDocumentTitle } from '../useDocumentTitle'
import { useGatekeeperApps } from '../useGatekeeperApps'

type GatekeeperAppSearch = {
  /** The app's own route (see app-host.ts): restores the screen on reload and deep-links launcher picks. */
  at?: string
}

/**
 * Generic host for any gatekeeper-served management app (VendorDescription.providesUi). The set of
 * apps and their nav entries come from the backend (useGatekeeperApps); nothing about a specific
 * gatekeeper is hardcoded here. GatekeeperAppPage renders "not available" if the id isn't bound.
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
  const navigate = Route.useNavigate()
  const app = useGatekeeperApps().find((a) => a.id === appId)
  useDocumentTitle(app?.title ?? 'App')
  // The URL mirrors the app's route; a new screen adds a history entry, so Back returns to it, and
  // a params-only change replaces the entry. Other URL changes are pushed into the open app.
  const onRouteChange = useCallback(
    (route: string, mode: AppRouteMode) => navigate({ search: { at: route || undefined }, replace: mode !== 'push' }),
    [navigate],
  )
  return <GatekeeperAppPage appId={appId} route={at ?? ''} onRouteChange={onRouteChange} />
}
