import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'sketch my home | Professional 2D Floor Plan Designer',
  description: 'Zero-install 2D architectural floor plan designer with Vastu grid support and cloud persistence.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body className={inter.className}>
        <div className="main-wrapper">
          {children}
        </div>
      </body>
    </html>
  );
}
