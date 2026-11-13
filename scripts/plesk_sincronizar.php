<?php
// Dispara la sincronización diaria de Mirage (POST /api/config/sincronizar-todo).
// Alternativa al comando curl cuando la tarea programada de Plesk no puede verificar certificados (curl error 77).
// Para PHP 7.4. Se sube a Plesk FUERA de httpdocs (en la carpeta que contiene httpdocs) con otro nombre y se le pone
// la clave de CRON_TOKEN abajo, en UNA sola linea ($TOKEN = '...'). No guardar en el repositorio una copia con la clave puesta
// ni pegarla en chats.

// Solo para la tarea programada (linea de comandos). Si alguien lo pide por la web, no hace nada y responde 404.
if (isset($_SERVER['REQUEST_METHOD']) || isset($_SERVER['HTTP_HOST'])) {
    http_response_code(404);
    exit;
}

$URL   = 'https://mirage.gixacr.com/api/config/sincronizar-todo';
$TOKEN = 'PEGA_AQUI_LA_CLAVE';

if (strpos($TOKEN, 'PEGA_AQUI') === 0 || strlen($TOKEN) < 24) {
    echo "Falta poner la clave de CRON_TOKEN en el script.\n";
    exit(2);
}
if (!function_exists('curl_init')) {
    echo "Este PHP no tiene la extension curl.\n";
    exit(2);
}

// La verificacion del certificado siempre queda activa; solo se le indica a curl donde esta el archivo de CAs si existe.
$candidatos = array('/etc/pki/tls/certs/ca-bundle.crt', '/etc/pki/tls/cert.pem', '/etc/ssl/certs/ca-certificates.crt', '/etc/ssl/cert.pem');
$ca = null;
foreach ($candidatos as $ruta) {
    if (is_readable($ruta)) {
        $ca = $ruta;
        break;
    }
}

$ch = curl_init($URL);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, '');
curl_setopt($ch, CURLOPT_HTTPHEADER, array('X-Cron-Token: ' . $TOKEN));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
if ($ca !== null) {
    curl_setopt($ch, CURLOPT_CAINFO, $ca);
}

$cuerpo = curl_exec($ch);
$codigo = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error  = curl_error($ch);
curl_close($ch);

if ($cuerpo === false) {
    echo 'ERROR de conexion: ' . $error . ' (archivo de CAs usado: ' . ($ca === null ? 'ninguno' : $ca) . ")\n";
    exit(1);
}

$json = json_decode($cuerpo, true);
$estado = (is_array($json) && isset($json['estado'])) ? ' - estado: ' . $json['estado'] : '';
echo 'HTTP ' . $codigo . $estado . "\n";
exit($codigo === 202 ? 0 : 1);
