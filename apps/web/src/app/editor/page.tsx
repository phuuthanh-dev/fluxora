import { privateMetadata } from "../../features/public-site/site";
import { WorkflowEditor } from "@/features/workflow/workflow-editor";

export const metadata = privateMetadata;

export default function EditorPage() {
  return <WorkflowEditor />;
}
