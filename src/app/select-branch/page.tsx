import { redirect } from "next/navigation";

/** Bookmark/legacy URL — branch switching is in the header ContextSwitcher. */
export default function SelectBranchPage() {
  redirect("/");
}
