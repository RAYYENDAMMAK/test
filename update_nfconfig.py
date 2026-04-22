import os

path = 'ui/frontend/src/pages/NFConfig.tsx'

with open(path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip_until = None

for i, line in enumerate(lines):
    # 1. Update FieldInput props and logic
    if 'function FieldInput({' in line:
        new_lines.append('function FieldInput({\n')
        new_lines.append('  field, value, globalValue, podIP, onChange,\n')
        new_lines.append('}: {\n')
        new_lines.append('  field: FieldDef;\n')
        new_lines.append('  value: any;\n')
        new_lines.append('  globalValue?: any;\n')
        new_lines.append('  podIP?: string;\n')
        new_lines.append('  onChange: (v: any) => void;\n')
        new_lines.append('}) {\n')
        skip_until = i + 8
        continue

    if skip_until and i <= skip_until:
        continue

    # Injection for display value substitution
    if '  if (field.type === \'select\') {' in line:
        new_lines.append(line)
        new_lines.append('    return (\n')
        new_lines.append('      <select value={value ?? \'\'} onChange={e => onChange(e.target.value)} className={base}>\n')
        new_lines.append('        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}\n')
        new_lines.append('      </select>\n')
        new_lines.append('    );\n')
        new_lines.append('  }\n\n')
        new_lines.append('  // Substitution for display: show real IP if template variable used\n')
        new_lines.append('  let displayValue = value ?? \'\';\n')
        new_lines.append('  let isSubstituted = false;\n')
        new_lines.append('  if (displayValue === \'${POD_IP}\' && podIP) {\n')
        new_lines.append('    displayValue = podIP;\n')
        new_lines.append('    isSubstituted = true;\n')
        new_lines.append('  }\n\n')
        new_lines.append('  return (\n')
        new_lines.append('    <div className="relative">\n')
        new_lines.append('      <input\n')
        new_lines.append('        type={field.type === \'number\' ? \'number\' : \'text\'}\n')
        new_lines.append('        value={displayValue}\n')
        new_lines.append('        placeholder={field.placeholder}\n')
        new_lines.append('        onChange={e => {\n')
        new_lines.append('          let val = e.target.value;\n')
        new_lines.append('          if (isSubstituted && val === podIP) val = \'${POD_IP}\';\n')
        new_lines.append('          onChange(field.type === \'number\' ? Number(val) : val);\n')
        new_lines.append('        }}\n')
        new_lines.append('        className={`${base} ${isSubstituted ? \'text-emerald-400 font-bold\' : \'\'}`}\n')
        new_lines.append('        style={field.unit ? { paddingRight: \'2.5rem\' } : undefined}\n')
        new_lines.append('      />\n')
        new_lines.append('      {field.unit && (\n')
        new_lines.append('        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">{field.unit}</span>\n')
        new_lines.append('      )}\n')
        new_lines.append('      {isSubstituted && (\n')
        new_lines.append('        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-emerald-500/50 uppercase font-bold pointer-events-none">\n')
        new_lines.append('          Live IP\n')
        new_lines.append('        </span>\n')
        new_lines.append('      )}\n')
        new_lines.append('    </div>\n')
        new_lines.append('  );\n')
        new_lines.append('}\n')
        
        # We need to skip the original return block
        skip_until = i + 19 # Adjusted to skip the old input block
        continue
    
    # 2. Update NFFormPanel
    if 'function NFFormPanel({' in line:
         new_lines.append('function NFFormPanel({\n')
         new_lines.append('  nfName, fields, globalCfg, podIP, onChange,\n')
         new_lines.append('}: {\n')
         new_lines.append('  nfName: string;\n')
         new_lines.append('  fields: Record<string, any>;\n')
         new_lines.append('  globalCfg: GlobalConfig;\n')
         new_lines.append('  podIP?: string;\n')
         new_lines.append('  onChange: (key: string, value: any) => void;\n')
         new_lines.append('}) {\n')
         skip_until = i + 6
         continue
         
    if 'onChange={v => onChange(field.key, v)}' in line and 'FieldInput' in lines[i-1]:
         # Find the line where FieldInput starts
         new_lines.append('                  <FieldInput\n')
         new_lines.append('                    field={field}\n')
         new_lines.append('                    value={val}\n')
         new_lines.append('                    globalValue={globalVal}\n')
         new_lines.append('                    podIP={podIP}\n')
         new_lines.append('                    onChange={v => onChange(field.key, v)}\n')
         new_lines.append('                  />\n')
         # We need to skip the old FieldInput block
         # The original was:
         # <FieldInput
         #   field={field}
         #   value={val}
         #   globalValue={globalVal}
         #   onChange={v => onChange(field.key, v)}
         # />
         # So we skip back and forward
         # Actually just replace the whole tag
         # This script is getting complicated, let's try a simpler approach for the rest.
         continue

    new_lines.append(line)

# This script is a bit risky, let's just write the whole file content I prepared.
