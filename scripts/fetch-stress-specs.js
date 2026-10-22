/**
 * Downloads the real-world OpenAPI specifications used by the opt-in stress
 * routine. They total ~17MB and are deliberately not committed: every clone of
 * the repository would otherwise pay for fixtures that only one manual routine
 * reads.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGET_DIR = path.resolve(__dirname, '..', 'test', 'swagger_schemas');

const SPECS = [
    {
        file: 'k8s_oa2.json',
        label: 'Kubernetes OpenAPI 2.0',
        url: 'https://raw.githubusercontent.com/kubernetes/kubernetes/release-1.29/api/openapi-spec/swagger.json'
    },
    {
        file: 'github_oa3.json',
        label: 'GitHub REST OpenAPI 3.0',
        url: 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json'
    }
];

function download(url, dest, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                if (redirectsLeft === 0) {
                    reject(new Error(`too many redirects for ${url}`));
                    return;
                }
                resolve(download(res.headers.location, dest, redirectsLeft - 1));
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            // Buffer in memory so a failed transfer cannot leave a truncated file
            // that the runner would then parse as a corrupt spec.
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                try {
                    JSON.parse(body.toString('utf8'));
                } catch (e) {
                    reject(new Error(`downloaded ${url} is not valid JSON: ${e.message}`));
                    return;
                }
                fs.writeFileSync(dest, body);
                resolve(body.length);
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

(async () => {
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }
    for (const spec of SPECS) {
        const dest = path.join(TARGET_DIR, spec.file);
        if (fs.existsSync(dest)) {
            console.log(`- ${spec.file} already present, skipping`);
            continue;
        }
        process.stdout.write(`- downloading ${spec.label} ... `);
        const bytes = await download(spec.url, dest);
        console.log(`${(bytes / (1024 * 1024)).toFixed(1)}MB`);
    }
    console.log("Done. Run 'npm run stress' to crawl them.");
})().catch((e) => {
    console.error(`\nFailed: ${e.message}`);
    process.exit(1);
});
