<?php
/**
 * Plugin Name: AI Crawler Log
 * Description: Reports visits from AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) to your AI visibility dashboard. Only AI-bot requests are reported; visitors are never tracked.
 * Version: 1.0.0
 * Requires PHP: 7.4
 * License: MIT
 */

if (!defined('ABSPATH')) {
	exit;
}

const AICL_BOTS = '/GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|Google-CloudVertexBot|Gemini-Deep-Research|MistralAI-User|DuckAssistBot|meta-external(agent|fetcher)|Amazonbot|Applebot|Bytespider|CCBot|cohere-ai/i';

// Report AI-bot page loads without blocking the page (timeout 0.01s, non-blocking request).
add_action('template_redirect', function () {
	$ua = isset($_SERVER['HTTP_USER_AGENT']) ? (string) $_SERVER['HTTP_USER_AGENT'] : '';
	$url = (string) get_option('aicl_ingest_url', '');
	$key = (string) get_option('aicl_key', '');
	if ($ua === '' || $url === '' || $key === '' || !preg_match(AICL_BOTS, $ua)) {
		return;
	}
	$path = (string) wp_parse_url(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/', PHP_URL_PATH);
	wp_remote_post($url, array(
		'blocking' => false,
		'timeout'  => 0.01,
		'headers'  => array('Content-Type' => 'application/json', 'X-Crawler-Key' => $key),
		'body'     => wp_json_encode(array('hits' => array(array('ua' => $ua, 'path' => $path ?: '/', 'ts' => gmdate('c'))))),
	));
});

// Settings → AI Crawler Log: the two values from the dashboard's "AI crawlers" tab.
add_action('admin_init', function () {
	register_setting('aicl', 'aicl_ingest_url', array('type' => 'string', 'sanitize_callback' => 'esc_url_raw'));
	register_setting('aicl', 'aicl_key', array('type' => 'string', 'sanitize_callback' => 'sanitize_text_field'));
});

add_action('admin_menu', function () {
	add_options_page('AI Crawler Log', 'AI Crawler Log', 'manage_options', 'aicl', function () {
		?>
		<div class="wrap">
			<h1>AI Crawler Log</h1>
			<p>Copy both values from your AI visibility dashboard: brand → AI crawlers.</p>
			<form method="post" action="options.php">
				<?php settings_fields('aicl'); ?>
				<table class="form-table">
					<tr><th scope="row"><label for="aicl_ingest_url">Ingest URL</label></th>
						<td><input id="aicl_ingest_url" name="aicl_ingest_url" type="url" class="regular-text" value="<?php echo esc_attr(get_option('aicl_ingest_url', '')); ?>"></td></tr>
					<tr><th scope="row"><label for="aicl_key">Crawler key</label></th>
						<td><input id="aicl_key" name="aicl_key" type="password" class="regular-text" value="<?php echo esc_attr(get_option('aicl_key', '')); ?>"></td></tr>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	});
});
