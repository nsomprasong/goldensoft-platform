"use client";

import { useState, useTransition } from "react";

import { Switch } from "@/components/ui/switch";
import { pushToast } from "@/components/ui/toast";
import type { AuthFlexibilitySettings } from "@/lib/platform/system-settings";
import { TH } from "@/lib/i18n/th";

export function SystemSettingsToggles(props: {
  initial: AuthFlexibilitySettings;
}) {
  const [settings, setSettings] = useState(props.initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<AuthFlexibilitySettings>) {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setError(null);
    start(async () => {
      const res = await fetch("/api/platform/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        settings?: AuthFlexibilitySettings;
      };
      if (!res.ok) {
        setSettings(previous);
        const message = data.message ?? TH.common.failed;
        setError(message);
        pushToast(message);
        return;
      }
      if (data.settings) setSettings(data.settings);
      pushToast(TH.common.saved);
    });
  }

  return (
    <div className="space-y-4">
      <SettingToggleRow
        id="invitations-send"
        title={TH.settings.invitationsSendTitle}
        description={TH.settings.invitationsSendBody}
        checked={settings.invitationsSendEnabled}
        disabled={pending}
        onCheckedChange={(checked) =>
          update({ invitationsSendEnabled: checked })
        }
      />
      <SettingToggleRow
        id="phone-login"
        title={TH.settings.phoneLoginTitle}
        description={TH.settings.phoneLoginBody}
        checked={settings.phoneLoginEnabled}
        disabled={pending}
        onCheckedChange={(checked) => update({ phoneLoginEnabled: checked })}
      />
      {error ? (
        <p className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SettingToggleRow(props: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)]/40 px-4 py-3">
      <div className="min-w-0">
        <label
          htmlFor={props.id}
          className="block text-sm font-semibold text-[var(--foreground)]"
        >
          {props.title}
        </label>
        <p className="mt-1 text-[length:var(--text-helper)] text-[var(--text-muted)]">
          {props.description}
        </p>
        <p className="mt-1 text-[length:var(--text-caption)] font-medium text-[var(--text-secondary)]">
          {props.checked ? TH.settings.statusOn : TH.settings.statusOff}
        </p>
      </div>
      <Switch
        id={props.id}
        label={props.title}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onCheckedChange}
      />
    </div>
  );
}
