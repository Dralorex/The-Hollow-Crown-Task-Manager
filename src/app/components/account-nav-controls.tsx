"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  switchAccountAction,
  signOutCurrentAction,
} from "@/app/actions/accounts";
import { AppLink } from "@/app/components/app-link";
import { MenuSurface, menuItemClass } from "@/app/components/menu-surface";

export type NavAccount = {
  userId: string;
  username: string;
  label: string;
  active: boolean;
};

export function AccountSwitcher({
  displayLabel,
  accounts,
  compact = false,
}: {
  displayLabel: string;
  accounts: NavAccount[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex min-w-0 items-center gap-1">
      <MenuSurface
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        widthClass="min-w-[14rem]"
        trigger={({ ref }) => (
          <button
            ref={ref}
            type="button"
            aria-label="Switch account"
            aria-expanded={open}
            className={`shrink-0 rounded px-1 text-[color:var(--tide-deep)]/55 transition hover:bg-[color:var(--tide-deep)]/8 hover:text-[color:var(--tide-deep)] ${
              compact ? "text-xs" : "text-sm"
            }`}
            onClick={() => setOpen((v) => !v)}
          >
            ▾
          </button>
        )}
      >
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--tide-deep)]/45">
          Accounts on this device
        </div>
        {accounts.map((account) => (
          <button
            key={account.userId}
            type="button"
            disabled={pending || account.active}
            className={`${menuItemClass()} ${
              account.active ? "bg-[color:var(--tide-deep)]/8 font-semibold" : ""
            }`}
            onClick={() => {
              if (account.active) return;
              const fd = new FormData();
              fd.set("userId", account.userId);
              startTransition(async () => {
                await switchAccountAction(null, fd);
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <span className="block truncate">{account.label}</span>
            <span className="block text-[11px] text-[color:var(--tide-deep)]/50">
              @{account.username}
              {account.active ? " · current" : ""}
            </span>
          </button>
        ))}
        <div className="mx-2 my-1 border-t border-[color:var(--tide-deep)]/10" />
        <Link
          href="/login?addAccount=1"
          className="mx-2 mb-2 flex items-center gap-2 rounded-full bg-[color:var(--tide-deep)]/8 px-2.5 py-1.5 text-sm text-[color:var(--tide-deep)] hover:bg-[color:var(--tide-deep)]/12"
          onClick={() => setOpen(false)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--tide-deep)] text-xs font-bold text-[color:var(--tide-foam)]">
            +
          </span>
          <span className="font-medium">Add Account</span>
        </Link>
      </MenuSurface>

      <AppLink
        href="/app/profile"
        className={`inline-flex min-w-0 items-center gap-1 truncate underline-offset-2 hover:underline ${
          compact ? "max-w-[7.5rem] text-xs" : "text-sm"
        } text-[color:var(--tide-deep)]/80`}
        title="Profile"
        compactPending={compact}
      >
        <span className="truncate">{displayLabel}</span>
      </AppLink>
    </div>
  );
}

export function AppHamburgerMenu({ accounts }: { accounts: NavAccount[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <MenuSurface
      open={open}
      onClose={() => setOpen(false)}
      align="right"
      widthClass="min-w-[12rem]"
      trigger={({ ref }) => (
        <button
          ref={ref}
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--tide-deep)]/80 transition hover:bg-[color:var(--tide-deep)]/10"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex flex-col gap-1" aria-hidden>
            <span className="block h-0.5 w-4 rounded-full bg-current" />
            <span className="block h-0.5 w-4 rounded-full bg-current" />
            <span className="block h-0.5 w-4 rounded-full bg-current" />
          </span>
        </button>
      )}
    >
      <AppLink
        href="/app/profile"
        className={`${menuItemClass()} inline-flex items-center gap-1.5`}
        onClick={() => setOpen(false)}
      >
        Profile
      </AppLink>
      <AppLink
        href="/app/accounts"
        className={`${menuItemClass()} inline-flex items-center gap-1.5`}
        onClick={() => setOpen(false)}
      >
        Account
      </AppLink>
      <AppLink
        href="/app/settings"
        className={`${menuItemClass()} inline-flex items-center gap-1.5`}
        onClick={() => setOpen(false)}
      >
        Settings
      </AppLink>
      <div className="mx-2 my-1 border-t border-[color:var(--tide-deep)]/10" />
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--tide-deep)]/45">
        Quick switch
      </div>
      {accounts.map((account) => (
        <button
          key={account.userId}
          type="button"
          disabled={pending || account.active}
          className={`${menuItemClass()} ${
            account.active ? "bg-[color:var(--tide-deep)]/8 font-semibold" : ""
          }`}
          onClick={() => {
            if (account.active) return;
            const fd = new FormData();
            fd.set("userId", account.userId);
            startTransition(async () => {
              await switchAccountAction(null, fd);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {account.label}
          {account.active ? " ·" : ""}
        </button>
      ))}
      <Link
        href="/login?addAccount=1"
        className="mx-2 my-1 flex items-center gap-2 rounded-full bg-[color:var(--tide-deep)]/8 px-2.5 py-1.5 text-sm text-[color:var(--tide-deep)] hover:bg-[color:var(--tide-deep)]/12"
        onClick={() => setOpen(false)}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--tide-deep)] text-xs font-bold text-[color:var(--tide-foam)]">
          +
        </span>
        <span className="font-medium">Add Account</span>
      </Link>
      <div className="mx-2 my-1 border-t border-[color:var(--tide-deep)]/10" />
      <button
        type="button"
        className={menuItemClass(true)}
        onClick={() => {
          startTransition(async () => {
            await signOutCurrentAction();
          });
        }}
      >
        Sign Out
      </button>
    </MenuSurface>
  );
}
