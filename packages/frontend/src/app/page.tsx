'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex justify-between items-center py-6">
          <h1 className="text-2xl font-bold">StrataGPT</h1>
          <Button 
            onClick={() => router.push(isAuthenticated ? '/dashboard' : '/auth')}
          >
            {isAuthenticated ? 'Dashboard' : 'Sign In'}
          </Button>
        </nav>

        <main className="mt-20 text-center">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            AI-Powered Strata Management
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Get instant answers to your strata questions, generate legal documents, 
            and manage your property with the power of AI.
          </p>
          <div className="space-x-4">
            <Button 
              size="lg" 
              onClick={() => router.push('/auth')}
            >
              Get Started Free
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => router.push('/pricing')}
            >
              View Pricing
            </Button>
          </div>
        </main>

        <section className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Instant Answers</h3>
            <p className="text-gray-600">
              Get accurate answers to your strata questions based on NSW legislation.
            </p>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Document Generation</h3>
            <p className="text-gray-600">
              Create legally compliant documents in seconds with AI assistance.
            </p>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">24/7 Availability</h3>
            <p className="text-gray-600">
              Access expert strata knowledge anytime, anywhere.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
