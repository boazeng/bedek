import TactIcon from './TactIcon'
import StatusBar from './StatusBar'
import type { ProjectKpi } from '../lib/api'

type Props = { project: ProjectKpi }

const TONES = ['tone-steel', 'tone-blue', 'tone-green', 'tone-rust']

export default function ProjectCard({ project }: Props) {
  const tone = TONES[project.project_id % TONES.length]
  const closedPct =
    project.total > 0 ? Math.round((project.done / project.total) * 100) : 0

  return (
    <div className={`tact-card ${tone}`}>
      <div className="tact-card-cap">
        <div className="flex items-center gap-3">
          <div className="tact-card-ico">
            <TactIcon name="building" size={18} stroke={1.7} />
          </div>
          <div>
            <div className="font-semibold text-warm-ink text-base leading-tight">
              {project.project_name}
            </div>
            {project.address && (
              <div className="text-[12px] text-taupe">{project.address}</div>
            )}
          </div>
        </div>
        <span className="tact-badge tact-badge-on">{project.total} ליקויים</span>
      </div>

      <div className="tact-card-body">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Mini
            label="פתוחות"
            value={project.open_count}
            color="var(--color-accent)"
          />
          <Mini
            label="לביצוע"
            value={project.todo}
            color="var(--color-primary)"
          />
          <Mini
            label="הסתיים"
            value={project.done}
            color="var(--color-pos)"
          />
        </div>

        <StatusBar breakdown={project.by_status} />

        <div className="mt-4 flex items-center justify-between text-[12px] text-taupe">
          <span>
            ממתין לאישור מנהל:{' '}
            <strong style={{ color: 'var(--color-accent)' }}>
              {project.pending_manager}
            </strong>
          </span>
          <span>
            השלמה:{' '}
            <strong style={{ color: 'var(--color-pos)' }}>{closedPct}%</strong>
          </span>
        </div>
        {project.avg_days_open !== null && project.avg_days_open !== undefined && (
          <div className="mt-1 text-[12px] text-taupe">
            ממוצע זמן פתיחה:{' '}
            <strong className="font-en">
              {Math.round(project.avg_days_open)}
            </strong>{' '}
            ימים
          </div>
        )}
      </div>
    </div>
  )
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-[11px] text-taupe font-semibold">{label}</div>
      <div className="font-en font-bold text-2xl" style={{ color }}>
        {value.toLocaleString('he-IL')}
      </div>
    </div>
  )
}
