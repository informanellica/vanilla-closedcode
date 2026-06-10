import { createComponent as _$createComponent } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createResource, createMemo } from "solid-js";
import { DialogSelect } from "#tui/ui/dialog-select.js";
import { useSDK } from "#tui/context/sdk.js";
import { useDialog } from "#tui/ui/dialog.js";
import { useToast } from "#tui/ui/toast.js";
import { useTheme } from "#tui/context/theme.js";
const accountHost = url => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const accountLabel = item => `${item.accountEmail}  ${accountHost(item.accountUrl)}`;
export function DialogConsoleOrg() {
  const sdk = useSDK();
  const dialog = useDialog();
  const toast = useToast();
  const {
    theme
  } = useTheme();
  const [orgs] = createResource(async () => {
    const result = await sdk.client.experimental.console.listOrgs({}, {
      throwOnError: true
    });
    return result.data?.orgs ?? [];
  });
  const current = createMemo(() => orgs()?.find(item => item.active));
  const options = createMemo(() => {
    const listed = orgs();
    if (listed === undefined) {
      return [{
        title: "Loading orgs...",
        value: "loading",
        onSelect: () => {}
      }];
    }
    if (listed.length === 0) {
      return [{
        title: "No orgs found",
        value: "empty",
        onSelect: () => {}
      }];
    }
    return listed.toSorted((a, b) => {
      const activeAccountA = a.active ? 0 : 1;
      const activeAccountB = b.active ? 0 : 1;
      if (activeAccountA !== activeAccountB) return activeAccountA - activeAccountB;
      const accountCompare = accountLabel(a).localeCompare(accountLabel(b));
      if (accountCompare !== 0) return accountCompare;
      return a.orgName.localeCompare(b.orgName);
    }).map(item => ({
      title: item.orgName,
      value: item,
      category: accountLabel(item),
      categoryView: (() => {
        var _el$ = _$createElement("box"),
          _el$2 = _$createElement("text"),
          _el$3 = _$createElement("text");
        _$insertNode(_el$, _el$2);
        _$insertNode(_el$, _el$3);
        _$setProp(_el$, "flexDirection", "row");
        _$setProp(_el$, "gap", 2);
        _$insert(_el$2, () => item.accountEmail);
        _$insert(_el$3, () => accountHost(item.accountUrl));
        _$effect(_p$ => {
          var _v$ = theme.accent,
            _v$2 = theme.textMuted;
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$3, "fg", _v$2, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$;
      })(),
      onSelect: async () => {
        if (item.active) {
          dialog.clear();
          return;
        }
        await sdk.client.experimental.console.switchOrg({
          accountID: item.accountID,
          orgID: item.orgID
        }, {
          throwOnError: true
        });
        await sdk.client.instance.dispose();
        toast.show({
          message: `Switched to ${item.orgName}`,
          variant: "info"
        });
        dialog.clear();
      }
    }));
  });
  return _$createComponent(DialogSelect, {
    title: "Switch org",
    get options() {
      return options();
    },
    get current() {
      return current();
    }
  });
}