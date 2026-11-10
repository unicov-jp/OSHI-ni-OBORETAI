import type { Metadata } from "next";
import { ManageView } from "@/components/manage-view";
import { requireViewer } from "@/lib/auth";
import { getLibrary } from "@/lib/data";

export const metadata: Metadata = { title: "推しの登録" };

export default async function ManagePage() {
  const [viewer, library] = await Promise.all([requireViewer(), getLibrary()]);
  return <ManageView viewer={viewer} {...library} />;
}
