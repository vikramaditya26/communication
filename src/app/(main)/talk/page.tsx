import { TalkView } from "@/components/talk/TalkView";

export const metadata = { title: "Talk" };

export default async function TalkPage(props: PageProps<"/talk">) {
  const { c } = await props.searchParams;
  return <TalkView initial={Array.isArray(c) ? c[0] : c} />;
}
