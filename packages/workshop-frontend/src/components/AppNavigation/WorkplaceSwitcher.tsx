import { useState } from "react";
import { DropdownMenu } from "@cloudflare/kumo";
import { ArrowSquareOutIcon, BriefcaseIcon, CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useAuthenticatedApi } from "../../AuthContext";
import { MENU_CONTENT, MENU_ITEM, MENU_POSITIONER_STYLE } from "../menuStyles";
import { useCloseOnFrameFocus } from "../useCloseOnFrameFocus";
import { revalidateAppNavigation, useAppNavigation } from "./useAppNavigation";

const HEADING = "px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-kumo-inactive";

/**
 * Topbar switcher between the named views an app publishes in `AppNavigation.workplaces`, left of
 * the Menu. Picking an option asks the app to apply it server-side, then refetches the navigation
 * (sidebar, Menu and Spotlight actions follow). Links to other systems open in a new tab. Renders
 * nothing when no app publishes a switcher.
 */
export default function WorkplaceSwitcher() {
  const { authenticatedApi } = useAuthenticatedApi();
  const navigation = useAppNavigation();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  useCloseOnFrameFocus(open, setOpen);
  const holder = navigation.find((entry) => entry.workplaces);
  const workplaces = holder?.workplaces;
  if (!holder || !workplaces) return null;

  const current = workplaces.options.find((option) => option.id === workplaces.current);
  const choose = (id: string) => {
    if (pending || id === workplaces.current) return;
    setPending(true);
    authenticatedApi
      .selectAppWorkplace(holder.appId, id)
      .then(() => revalidateAppNavigation(authenticatedApi, true))
      .catch((err) => console.error("Workplace: failed to switch", err))
      .finally(() => setPending(false));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        render={
          <button
            type="button"
            data-tour="workplace"
            aria-label={`${workplaces.label}: ${current?.title ?? ""}`}
            className="press flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-kumo-line bg-kumo-base px-2.5 text-[13px] font-medium text-kumo-default transition-colors hover:bg-kumo-tint data-[popup-open]:bg-kumo-tint"
          >
            <BriefcaseIcon size={14} aria-hidden />
            <span className="max-w-[200px] truncate">{current?.title}</span>
            <CaretDownIcon size={12} aria-hidden />
          </button>
        }
      />
      <DropdownMenu.Content align="start" className={MENU_CONTENT} style={MENU_POSITIONER_STYLE}>
        {workplaces.options.map((option) => (
          <DropdownMenu.Item key={option.id} disabled={pending} onClick={() => choose(option.id)} className={MENU_ITEM}>
            <span className="flex items-start gap-2">
              <span className="mt-0.5 w-3.5 shrink-0">
                {option.id === workplaces.current && <CheckIcon size={14} aria-hidden />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span>{option.title}</span>
                {option.description && <span className="text-xs text-kumo-subtle">{option.description}</span>}
              </span>
            </span>
          </DropdownMenu.Item>
        ))}
        {workplaces.external && (
          <>
            <DropdownMenu.Separator />
            <p className={HEADING}>{workplaces.external.title}</p>
            {workplaces.external.links.map((link) => (
              <DropdownMenu.Item
                key={link.id}
                onClick={() => window.open(link.href, "_blank", "noopener,noreferrer")}
                className={MENU_ITEM}
              >
                <span className="flex items-center gap-2">
                  <ArrowSquareOutIcon size={14} aria-hidden />
                  {link.title}
                </span>
              </DropdownMenu.Item>
            ))}
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
