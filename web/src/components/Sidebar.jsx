import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_GROUPS } from '../config/navigation';
import { useAuth } from '../hooks/useAuth';

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  const groups = NAV_GROUPS.filter(
    (g) => !g.adminOnly || user?.role === 'admin'
  );

  const activeGroupId = groups.find((g) =>
    g.items.some((it) => location.pathname.startsWith(it.path))
  )?.id;

  const [open, setOpen] = useState(() => {
    const init = {};
    for (const g of groups) {
      init[g.id] = g.defaultOpen || g.id === activeGroupId;
    }
    return init;
  });

  const toggle = (id) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  return (
    <aside className="sidebar">
      {groups.map((group) => {
        const GroupIcon = group.icon;
        const isOpen = open[group.id];
        return (
          <div key={group.id} className="sidebar-group">
            <button
              type="button"
              className="sidebar-group-header"
              onClick={() => toggle(group.id)}
              aria-expanded={isOpen}
            >
              <GroupIcon size={16} />
              <span className="sidebar-group-label">{group.label}</span>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {isOpen && (
              <ul className="sidebar-items">
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          `sidebar-item${isActive ? ' is-active' : ''}`
                        }
                      >
                        <ItemIcon size={15} />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </aside>
  );
}