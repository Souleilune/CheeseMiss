import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Configure Poppins font with multiple weights and styles
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap", // Improves font loading performance
});

export const metadata: Metadata = {
  title: "CheeseMiss - Filipino Corruption News",
  description: "Latest news on corruption cases in the Philippines - DPWH, flood control, politicians, and nepotism",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${poppins.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}