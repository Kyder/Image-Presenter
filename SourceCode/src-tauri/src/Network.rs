use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::net::UdpSocket;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub manual: bool,
    pub online: bool,
    pub last_seen: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum DiscoveryMessage {
    Announce {
        id: String,
        name: String,
        port: u16,
    },
}

/// Start the UDP discovery service
pub async fn start_discovery(config: Arc<Mutex<crate::config::Config>>) -> Result<()> {
    let cfg = config.lock().await;
    let discovery_port = cfg.discovery_port;
    let device_name = cfg.display_name.clone();
    let app_port = cfg.port;
    drop(cfg);
    
    // Bind to the discovery port
    let socket = UdpSocket::bind(format!("0.0.0.0:{}", discovery_port)).await?;
    socket.set_broadcast(true)?;
    
    println!("Discovery service listening on port {}", discovery_port);
    
    // Spawn announcement task
    let announce_socket = socket.try_clone()?;
    let announce_config = config.clone();
    tokio::spawn(async move {
        announce_periodically(announce_socket, announce_config, device_name, app_port, discovery_port).await;
    });
    
    // Listen for announcements from other devices
    let mut buf = [0u8; 1024];
    loop {
        match socket.recv_from(&mut buf).await {
            Ok((len, addr)) => {
                if let Ok(msg_str) = std::str::from_utf8(&buf[..len]) {
                    if let Ok(msg) = serde_json::from_str::<DiscoveryMessage>(msg_str) {
                        match msg {
                            DiscoveryMessage::Announce { id, name, port } => {
                                // Check if this is from ourselves
                                let cfg = config.lock().await;
                                if id == cfg.display_name {
                                    continue;
                                }
                                drop(cfg);
                                
                                // Update or add peer
                                let mut cfg = config.lock().await;
                                let peer_id = format!("{}:{}", addr.ip(), port);
                                
                                if let Some(peer) = cfg.peers.iter_mut().find(|p| p.id == peer_id) {
                                    peer.name = name;
                                    peer.online = true;
                                    peer.last_seen = Some(chrono::Utc::now().timestamp());
                                } else {
                                    // Add new peer
                                    cfg.peers.push(Peer {
                                        id: peer_id,
                                        name,
                                        ip: addr.ip().to_string(),
                                        port,
                                        manual: false,
                                        online: true,
                                        last_seen: Some(chrono::Utc::now().timestamp()),
                                    });
                                    println!("Discovered new peer: {} at {}:{}", name, addr.ip(), port);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Discovery receive error: {}", e);
            }
        }
    }
}

/// Periodically announce this device's presence
async fn announce_periodically(
    socket: UdpSocket,
    config: Arc<Mutex<crate::config::Config>>,
    device_name: String,
    port: u16,
    discovery_port: u16,
) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
    
    loop {
        interval.tick().await;
        
        let announcement = DiscoveryMessage::Announce {
            id: device_name.clone(),
            name: device_name.clone(),
            port,
        };
        
        if let Ok(msg) = serde_json::to_string(&announcement) {
            let msg_bytes = msg.as_bytes();
            
            // Broadcast to network
            let _ = socket.send_to(msg_bytes, format!("255.255.255.255:{}", discovery_port)).await;
            
            // Also send to localhost for multiple instances on same machine
            let _ = socket.send_to(msg_bytes, format!("127.0.0.1:{}", discovery_port)).await;
            
            // Send to static IP subnet if configured
            let cfg = config.lock().await;
            if !cfg.static_ip.is_empty() {
                if let Some(subnet) = get_subnet_broadcast(&cfg.static_ip) {
                    let _ = socket.send_to(msg_bytes, format!("{}:{}", subnet, discovery_port)).await;
                }
            }
        }
    }
}

/// Get broadcast address for a subnet
fn get_subnet_broadcast(ip: &str) -> Option<String> {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() == 4 {
        Some(format!("{}.{}.{}.255", parts[0], parts[1], parts[2]))
    } else {
        None
    }
}

/// Check if a peer is online
pub async fn check_peer_status(peer: &Peer) -> bool {
    let url = format!("http://{}:{}/api/config", peer.ip, peer.port);
    
    match reqwest::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

/// Periodically check all peer statuses
pub async fn check_all_peers(config: Arc<Mutex<crate::config::Config>>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
    
    loop {
        interval.tick().await;
        
        let mut cfg = config.lock().await;
        let peers = cfg.peers.clone();
        drop(cfg);
        
        for peer in peers.iter() {
            let online = check_peer_status(peer).await;
            
            let mut cfg = config.lock().await;
            if let Some(p) = cfg.peers.iter_mut().find(|p| p.id == peer.id) {
                p.online = online;
                if online {
                    p.last_seen = Some(chrono::Utc::now().timestamp());
                }
            }
        }
        
        // Clean up old auto-discovered peers (not manual)
        let mut cfg = config.lock().await;
        let now = chrono::Utc::now().timestamp();
        cfg.peers.retain(|p| {
            p.manual || p.last_seen.map_or(false, |last| now - last < 30)
        });
    }
}