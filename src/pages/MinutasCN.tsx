import Minutas from '@/pages/Minutas';

// Minutas de Cumplimiento Normativo: mismo módulo que Minutas de Obras, ligado a
// colegio + tema y con su propia lista de destinatarios (ORS · Protección Civil).
export default function MinutasCN() {
  return <Minutas modulo="cumplimiento" />;
}
