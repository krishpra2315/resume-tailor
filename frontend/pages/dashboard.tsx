import { Inria_Sans } from "next/font/google";
import Head from "next/head";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";

const inriaSans = Inria_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

export default function Dashboard() {
  return (
    <div
      className={`flex flex-col min-h-screen bg-gradient-to-r from-blue-100 via-white to-purple-100 ${inriaSans.className}`}
    >
      <Head>
        <title>Dashboard - Resume Tailor</title>
        <meta
          name="description"
          content="View your dashboard to see your master & tailored resumes"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <nav className="shadow-md w-full py-3 px-6 flex justify-between items-center text-black sticky bg-gradient-to-r from-blue-100 via-white to-purple-100 top-0 z-10">
        <div className="flex flex-1 flex-row items-center gap-4">
          <Link href="/">
            <span className="text-3xl font-bold cursor-pointer">
              Resume Tailor
            </span>
          </Link>
          <span className="text-3xl font-bold">&gt;</span>
          <span className="text-3xl font-bold">Dashboard</span>
        </div>
      </nav>
    </div>
  );
}
