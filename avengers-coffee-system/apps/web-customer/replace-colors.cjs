const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace all orange hex codes with HC green/red
const replacements = [
  ['#d67b3c', '#1a8b46'],
  ['#df6f37', '#1a8b46'],
  ['#e67a3a', '#1a8b46'],
  ['#cb6f36', '#1a8b46'],
  ['#cd6a2a', '#1a8b46'],
  ['#ef7d40', '#1a8b46'],
  ['#ef8e55', '#1a8b46'],
  ['#d0672a', '#1a8b46'],
  ['#c98754', '#1a8b46'],
  ['#e79a67', '#1a8b46'],
  ['#b35a1f', '#1a8b46'],
  ['#d77457', '#1a8b46'],
  ['#b45309', '#c41230'],
  // Border/background warm colors -> neutral
  ['#efc8a9', '#c8e6d3'],
  ['#efc9a8', '#c8e6d3'],
  ['#ecd4bc', '#d4e8db'],
  ['#e9d2bd', '#d4e8db'],
  ['#eed8c3', '#d4e8db'],
  ['#f1d0b2', '#d4e8db'],
  ['#decebd', '#d4e8db'],
  ['#dacbb9', '#c8e6d3'],
  ['#ece6de', '#e8e8e8'],
  ['#e7b48d', '#c8e6d3'],
  // Orange-tinted backgrounds -> green-tinted
  ['#f7e4cf', '#e8f5ee'],
  ['#fff8ee', '#f0faf4'],
  ['#fffcf5', '#f7fdf9'],
  ['#fff2e5', '#e8f5ee'],
  ['#f6dcc7', '#d4eddc'],
  ['#fff5eb', '#e8f5ee'],
  ['#fff7ef', '#f0faf4'],
  ['#f3e8bb', '#e8f5ee'],
  ['#fbf7ea', '#f0faf4'],
  ['#ece3cc', '#d4e8db'],
  ['#f7f0df', '#f0faf4'],
  ['#f3f0e5', '#f0faf4'],
  ['#ede8db', '#e8f5ee'],
  ['#efe9e0', '#e8e8e8'],
  ['#efe0a5', '#e8f5ee'],
  ['#efe8df', '#e8e8e8'],
  // Text/accent
  ['Avengers House', 'Avengers Coffee'],
  ['The Avengers House', 'Avengers Coffee'],
  ['THE AVENGERS HOUSE', 'AVENGERS COFFEE'],
  // Shadow colors
  ['shadow-orange-200', 'shadow-green-200'],
  ['shadow-orange-100/70', 'shadow-green-100/50'],
  ['shadow-orange-100', 'shadow-green-100'],
  ['shadow-orange-200/70', 'shadow-green-200/50'],
  // BG tints
  ['bg-orange-50', 'bg-green-50'],
  ['bg-orange-100/70', 'bg-green-100/60'],
  ['bg-orange-100', 'bg-green-100'],
  ['hover:bg-orange-50', 'hover:bg-green-50'],
  ['hover:bg-orange-100', 'hover:bg-green-100'],
  // Border tints  
  ['border-orange-100', 'border-green-100'],
  ['border-orange-200', 'border-green-200'],
  // From/to gradient
  ['from-orange-50', 'from-green-50'],
  ['to-amber-50', 'to-emerald-50'],
  // Warm backgrounds
  ['#fffaf3', '#f0faf4'],
  ['#f9efdf', '#e8f5ee'],
  ['#decfbe', '#c8e6d3'],
  ['#fffdfa', '#f7fdf9'],
  // Profile section
  ['from-[#f6dcc7]', 'from-[#d4eddc]'],
  ['via-[#fff2e5]', 'via-[#e8f5ee]'],
  ['to-[#f6dcc7]', 'to-[#d4eddc]'],
];

for (const [from, to] of replacements) {
  content = content.split(from).join(to);
}

fs.writeFileSync(filePath, content);
console.log('Done! Color replacements applied to App.jsx');
