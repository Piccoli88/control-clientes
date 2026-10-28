
import { supabase } from './supabase';

export async function testSupabase() {
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error de Supabase:', error.message);
    return;
  }

  console.log('¡Conexión con Supabase confirmada!');
  console.log('Consulta a clientes completada.');
  console.log('Filas recibidas:', data.length);
}

