import { useCallback, useState } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { RpcStub } from 'capnweb'
import { Overseer } from '@gadgets/workshop-shared/api'
import { ActionKind } from '@gadgets/workshop-shared/gatekeeper'

const tagKey = (gatekeeperId: number, tag: string) => `${gatekeeperId}:${tag}`

/**
 * Enables an auto-approval rule for an action's (gatekeeperId, actionKind.tag). Tracks the tags
 * whose pending actions the server is applying now (the call resolves once they are decided), so
 * every same-tag pending row shows the apply in progress, and the tags already enabled, so the
 * affordance hides at once rather than waiting for the action-log subscription to catch up.
 */
export function useAlwaysApproveTag(
    overseer: RpcStub<Overseer>,
    // Invoked after a rule is successfully enabled, so other views (e.g. the Connections rule list)
    // can refresh without waiting to be re-opened.
    onEnabled?: () => void) {
  const toasts = useKumoToastManager()
  const [enabledTags, setEnabledTags] = useState<Set<string>>(new Set())
  const [applyingTags, setApplyingTags] = useState<Set<string>>(new Set())

  // Enable auto-approval for the action's class; a failure is surfaced via a toast.
  const alwaysApproveTag = useCallback(
      async (gatekeeperId: number, actionKind: ActionKind): Promise<void> => {
    const key = tagKey(gatekeeperId, actionKind.tag)
    setApplyingTags(prev => new Set(prev).add(key))
    try {
      await overseer.setAutoApprovedActionKind(gatekeeperId, actionKind)
      setEnabledTags(prev => new Set(prev).add(key))
      onEnabled?.()
    } catch (err) {
      console.error('Failed to enable auto-approval:', err)
      toasts.add({ title: 'Failed to enable auto-approval', variant: 'error' })
    } finally {
      setApplyingTags(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [overseer, toasts, onEnabled])

  const isTagAutoApproved = useCallback(
      (gatekeeperId: number, tag: string) => enabledTags.has(tagKey(gatekeeperId, tag)),
      [enabledTags])

  const isTagApplying = useCallback(
      (gatekeeperId: number, tag: string) => applyingTags.has(tagKey(gatekeeperId, tag)),
      [applyingTags])

  return { alwaysApproveTag, isTagAutoApproved, isTagApplying }
}
