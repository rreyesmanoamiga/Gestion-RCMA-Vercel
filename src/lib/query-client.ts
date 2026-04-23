import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutos — evita re-fetch en cada mount
    },
    mutations: {
      // Manejador global: evita repetir lógica de error en cada formulario
      onError: (error) => {
        toast.error(error?.message ?? 'Ocurrió un error inesperado');
      },
    },
  },
});