// src/worker.ts
import puppeteer, { Browser } from '@cloudflare/puppeteer';

interface Env {
	MYBROWSER: Fetcher; // kommt aus der browser-Binding in wrangler.toml
}

export default
{
	async fetch( request: Request, env: Env, ctx: ExecutionContext ): Promise<Response>
	{
		const url = new URL(request.url);

		// Nur /api/screenshot über den Worker bedienen
		if (url.pathname === '/api/screenshot') {
			return createImage( request, env );
		}

		// Für alle anderen Pfade werden die Assets benutzt.
		// Wenn du *nur* assets = { directory = "public" } gesetzt hast,
		// brauchst du hier nichts weiter. Diese 404 kommt nur,
		// wenn kein Asset gefunden wurde.
		return new Response("Not found", { status: 404 });
	},
};

async function createImage( request: Request, env: Env ): Promise<Response>
{
	const { htmlContent, type } = await request.json();
	let browser: Browser | null = null;

	try {
		browser = await puppeteer.launch(env.MYBROWSER);
		const page = await browser.newPage();
		await page.setContent( htmlContent, { waitUntil: 'networkidle0' } );

		// Wait for the content to be rendered
		const element = await page.waitForSelector( '#wrapper', { visible: true } );
		if ( !element ) return new Response('Element not found', { status: 500 });

		// Get the height of the element
		const elementHeight = await page.evaluate( () =>
		{
			const element = document.querySelector( '#window' ) as HTMLElement;
			return element?.offsetHeight || 0;
		} );

		const width = type === 'discord' ? 1920 : 480 - 7;
		const height = type === 'discord' ? 1080: elementHeight;
		const viewport = { width: width, height: height };

		await page.setViewport( viewport );
		const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });

		await page.close();
		await browser.close();

		return new Response(screenshotBuffer, {
			status: 200,
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=60',
			},
		});
	}
	catch (err)
	{
		console.error('Screenshot error:', err);
		return new Response('Failed to capture screenshot', { status: 500 });
	}
}
