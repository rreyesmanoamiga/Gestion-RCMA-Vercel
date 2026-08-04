/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  safelist: [
    'grid-cols-24',
    { pattern: /col-span-(1[0-9]|2[0-4]|[1-9])/ },
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '24': 'repeat(24, minmax(0, 1fr))',
      },
      fontFamily: {
        sans:    ['var(--font-sans)'],
        display: ['var(--font-display)'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        // ── Rampas institucionales Mano Amiga (ancladas en los colores exactos
        // del Manual de Identidad Gráfica: navy #00295A, sky #4F82C2, naranja #ED7102).
        // Como todas las páginas ya usan las clases bg-slate-*/bg-blue-*/bg-amber-*,
        // sobreescribir estas rampas repinta todo el sistema sin tocar cada pantalla.
        slate: {
          50:  '#F6F7F9', 100: '#EAEDF0', 200: '#D3D8DF', 300: '#B2BCC7',
          400: '#8F9DAE', 500: '#77889C', 600: '#5E6E82', 700: '#4B5868',
          800: '#3A4450', 900: '#272D35', 950: '#181C21',
        },
        blue: {
          50:  '#F4F7FB', 100: '#E4ECF6', 200: '#C6D7EC', 300: '#9CB9DE',
          400: '#6E99CF', 500: '#4F82C2', 600: '#386BA8', 700: '#2D5586',
          800: '#224167', 900: '#00295A', 950: '#0E1B2A',
        },
        amber: {
          50:  '#FEF7F0', 100: '#FDE9D8', 200: '#FACEA8', 300: '#F7AE6E',
          400: '#F48D34', 500: '#ED7102', 600: '#ED7102', 700: '#B85B0A',
          800: '#914808', 900: '#743A06', 950: '#492404',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT:             'hsl(var(--sidebar-background))',
          foreground:          'hsl(var(--sidebar-foreground))',
          primary:             'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent:              'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border:              'hsl(var(--sidebar-border))',
          ring:                'hsl(var(--sidebar-ring))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}