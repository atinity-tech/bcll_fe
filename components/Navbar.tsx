'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { LogOut, User } from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <nav className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition">
            <div className="bg-white p-1.5 rounded-lg">
              <Image
                src="/bcll logo.png"
                alt="BCLL Logo"
                width={40}
                height={40}
                className="rounded"
              />
            </div>
            <span className="text-xl font-bold">Bhopal Bus POC</span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center space-x-6">
            {isAuthenticated ? (
              <>
                <div className="flex items-center space-x-2 bg-blue-700 px-4 py-2 rounded-lg">
                  <User className="w-4 h-4" />
                  <span className="text-sm font-medium">{user?.email}</span>
                  <span className="text-xs bg-blue-500 px-2 py-1 rounded">
                    {user?.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hover:bg-blue-700 px-4 py-2 rounded-lg transition"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="bg-white text-blue-600 hover:bg-gray-100 px-4 py-2 rounded-lg transition font-medium"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

