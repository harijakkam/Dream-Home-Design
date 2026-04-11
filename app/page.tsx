import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import SketchMyHomeDesigner from '@/components/SketchMyHomeDesigner';

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Example from user snippet
  const { data: todos } = await supabase.from('todos').select();
  const { data: { user } } = await supabase.auth.getUser();

  // Map to AppUser interface for SketchMyHomeDesigner
  const initialUser = user ? {
     id: user.id,
     email: user.email,
     role: (user.user_metadata?.role as 'admin'|'user') || 'user'
  } : null;

  return (
    <main className="app-container">
      <SketchMyHomeDesigner initialUser={initialUser} />
      
      {/* Sample Todos display from original request */}
      {todos && todos.length > 0 && (
        <div className="absolute bottom-4 right-4 p-4 bg-panel-bg rounded-lg border border-border-light text-xs">
          <h4 className="font-bold mb-2">Supabase Sync (Sample)</h4>
          <ul>
            {todos.map((todo: any) => (
              <li key={todo.id} className="text-text-muted">• {todo.name}</li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
