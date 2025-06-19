'use client';

import { Citation } from '@/types/chat';
import { Card } from '@/components/ui/card';
import { ExternalLink, BookOpen, FileText } from 'lucide-react';

interface CitationListProps {
  citations: Citation[];
}

export function CitationList({ citations }: CitationListProps) {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className=\"space-y-2\">
      <h4 className=\"text-sm font-medium text-gray-700 flex items-center gap-1\">
        <BookOpen className=\"h-3 w-3\" />
        Sources & Citations
      </h4>
      <div className=\"space-y-2\">
        {citations.map((citation, index) => (
          <Card key={index} className=\"p-3 bg-gray-50 border-gray-200\">
            <div className=\"flex items-start gap-2\">
              <FileText className=\"h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0\" />
              <div className=\"flex-1 min-w-0\">
                <div className=\"flex items-center gap-2 mb-1\">
                  <h5 className=\"text-sm font-medium text-gray-900 truncate\">
                    {citation.title}
                  </h5>
                  <div className=\"flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex-shrink-0\">
                    <span>{Math.round(citation.relevanceScore * 100)}%</span>
                  </div>
                </div>
                
                <p className=\"text-xs text-gray-600 mb-1\">
                  {citation.source}
                </p>
                
                {citation.section && (
                  <p className=\"text-xs text-gray-500\">
                    {citation.section}
                  </p>
                )}
              </div>
              
              <button className=\"flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors\">
                <ExternalLink className=\"h-3 w-3\" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}