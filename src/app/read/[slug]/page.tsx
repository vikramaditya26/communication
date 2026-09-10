import { notFound } from "next/navigation";
import { Reader } from "@/components/reader/Reader";
import { getBook } from "@/lib/library";

export async function generateMetadata(props: PageProps<"/read/[slug]">) {
  const { slug } = await props.params;
  const book = getBook(slug);
  return { title: book ? book.title : "Book not found" };
}

export default async function ReadPage(props: PageProps<"/read/[slug]">) {
  const { slug } = await props.params;
  const book = getBook(slug);
  if (!book) notFound();
  const { page } = await props.searchParams;
  const n = Number(Array.isArray(page) ? page[0] : page);
  return <Reader key={slug} book={book} initialPage={Number.isInteger(n) && n >= 1 ? n - 1 : null} />;
}
