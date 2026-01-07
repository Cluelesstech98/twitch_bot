const fs = require('fs');
const path = require('path');

const gitignorePath = path.join(__dirname, '.gitignore');
const envPath = path.join(__dirname, '.env');

console.log('=== Проверка конфигурации Git ===');

if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const ignoresEnv = gitignoreContent.includes('.env');
    
    console.log(`✅ .gitignore существует`);
    console.log(`   Игнорирует .env: ${ignoresEnv ? 'ДА' : 'НЕТ'}`);
    
    if (!ignoresEnv) {
        console.log('   ⚠️  Добавьте ".env" в .gitignore');
    }
} else {
    console.log('❌ .gitignore не найден');
}

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const hasTokens = envContent.includes('ACCESS_TOKEN') && envContent.includes('CLIENT_ID');
    
    console.log(`✅ .env существует`);
    console.log(`   Содержит токены: ${hasTokens ? 'ДА' : 'НЕТ'}`);
    
} else {
    console.log('❌ .env не найден');
    console.log('   Создайте файл .env из .env.example');
}

console.log('\n=== Рекомендуемые команды ===');
console.log('1. Проверить игнорируемые файлы: git status --ignored');
console.log('2. Посмотреть, что будет добавлено в Git: git add --dry-run .');
console.log('3. Проверить содержимое .gitignore: cat .gitignore');